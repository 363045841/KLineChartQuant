/**
 * 成交 Buffer 统一管理覆盖缓存、有界历史分页及实时衔接；视口变化只更新范围需求。
 *
 * 状态不变量：
 * - link.coveredTo > 0 仅在 link.active 时才有意义；断连或缺口后 active=false 且 coveredTo=0。
 * - link.since 记录订阅建立时刻，作为历史需求的上界；active=false 时不参与计算。
 * - lastID 为最后接受的实时序号，null 表示尚未收到实时帧。
 * - capacityBlocked 非空表示当前需求超出预算，需求缩小后清除。
 */
import { createSignal } from '../../../foundation/reactivity/signal.js'
import type { InstrumentDescriptor } from '../../provider/types.js'
import {
  EMPTY_TRADE_SNAPSHOT,
  type MarketTrade,
  TRADE_MESSAGES,
  TRADE_STATUS,
  type TradeBatch,
  type TradeBuffer,
  type TradeDataSource,
  type TradeRange,
  type TradeSnapshot,
} from '../types.js'
import { mergeTradeRanges, missingTradeRanges, TRADE_HISTORY_PAGE_MS } from './tradeRanges.js'

/** 逐笔成交内存预算：缓存上限与待定缓冲上限语义不同，各自命名取值。 */
const TRADE_MEMORY_BUDGET = Object.freeze({
  /** 覆盖缓存最多保留的成交条数，超出即拒绝写入并触发回收。 */
  cachedTrades: 250_000,
  /** 历史加载期间实时帧的待定缓冲上限，超出即中断加载并标记容量阻塞。 */
  pendingTrades: 250_000,
})

/** 实时连接与覆盖水位：三者共同表达订阅可用性与已确认的实时覆盖右水位。 */
interface TradeLinkState {
  /** 订阅链路已建立；断连或出现缺口后为 false。 */
  active: boolean
  /** 订阅建立时刻，作为历史需求上界；0 表示尚未建立。 */
  since: number
  /** 已确认的实时覆盖右水位；0 表示尚无连续覆盖。 */
  coveredTo: number
}

/** 同一品种只有一个顺序历史加载任务；已完成页缓存复用，失败页不自动重试。 */
export function createTradeBuffer(
  source: TradeDataSource,
  instrument: InstrumentDescriptor,
): TradeBuffer {
  const validTickSize =
    typeof instrument.tickSize === 'number' &&
    Number.isFinite(instrument.tickSize) &&
    instrument.tickSize > 0
  const tickSizeMessage = TRADE_MESSAGES.tickSizeInvalid
  const snapshot = createSignal<TradeSnapshot>({
    ...EMPTY_TRADE_SNAPSHOT,
    tickSize: String(instrument.tickSize ?? 0),
    status: validTickSize ? TRADE_STATUS.idle : TRADE_STATUS.error,
    message: validTickSize ? null : tickSizeMessage,
  })
  const stream = source.connect(instrument)
  let disposed = false
  let desired: TradeRange | null = null
  let request: AbortController | null = null
  let loading: Promise<void> | null = null
  let batches: TradeBatch[] = []
  const failed: TradeRange[] = []
  let ids = new Set<string>()
  let pending: MarketTrade[] = []
  let lastID: bigint | null = null
  const link: TradeLinkState = { active: false, since: 0, coveredTo: 0 }
  let capacityBlocked: TradeRange | null = null
  let failureMessage: string | null = null

  /** 是否具备可延续的实时尾部覆盖。 */
  function hasLiveCoverage(): boolean {
    return link.active && link.coveredTo > 0
  }

  /** 订阅时刻是否已建立、可作为历史需求上界。 */
  function hasSubscriptionClock(): boolean {
    return link.active && link.since > 0
  }

  /** 发布原子快照；加载状态不会撤销已确认历史覆盖。 */
  function publish(status: TradeSnapshot['status'], message: string | null = null): void {
    if (!disposed)
      snapshot.set({
        revision: snapshot.peek().revision + 1,
        status: validTickSize ? status : TRADE_STATUS.error,
        tickSize: String(instrument.tickSize ?? 0),
        batches: [...batches],
        message: validTickSize ? message : tickSizeMessage,
      })
  }

  /** 去重后合入批次，覆盖范围独立于批次是否有成交。 */
  function commit(batch: TradeBatch): boolean {
    const items: MarketTrade[] = []
    const seen = new Set<string>()
    for (const trade of batch.items) {
      if (ids.has(trade.tradeId) || seen.has(trade.tradeId)) continue
      seen.add(trade.tradeId)
      items.push(trade)
    }
    if (ids.size + items.length > TRADE_MEMORY_BUDGET.cachedTrades) return false
    for (const trade of items) ids.add(trade.tradeId)
    batches.push({ ...batch, items })
    if (batches.length >= 256) {
      const ranges = mergeTradeRanges(
        batches.filter((item) => item.complete).map((item) => item.range),
      )
      const all = batches.flatMap((item) => item.items)
      batches = ranges.map((range) => ({
        range,
        complete: true,
        items: all.filter((trade) => trade.timestamp >= range.from && trade.timestamp < range.to),
      }))
    }
    return true
  }

  /** 只回收预算之外且不属于当前可视需求的原始成交；普通滚动不会清掉缓存。 */
  function reclaimForDemand(): void {
    if (!desired) return
    const keep = desired
    batches = batches
      .filter((batch) => batch.range.to > keep.from && batch.range.from < keep.to)
      .map((batch) => ({
        ...batch,
        range: {
          from: Math.max(keep.from, batch.range.from),
          to: Math.min(keep.to, batch.range.to),
        },
        items: batch.items.filter(
          (trade) => trade.timestamp >= keep.from && trade.timestamp < keep.to,
        ),
      }))
    ids = new Set(batches.flatMap((batch) => batch.items.map((trade) => trade.tradeId)))
  }

  /** 实时输入以连续 ID 确认尾部覆盖，历史查看不拉取可视区到当前时刻之间的成交。 */
  function appendLive(trades: readonly MarketTrade[]): void {
    if (!hasLiveCoverage() || trades.length === 0 || capacityBlocked) return
    const items = trades.filter(
      (trade) => trade.timestamp >= link.coveredTo && !ids.has(trade.tradeId),
    )
    if (items.length === 0) return
    const to = Math.max(link.coveredTo, items[items.length - 1]!.timestamp + 1)
    if (desired && desired.to < link.coveredTo - TRADE_HISTORY_PAGE_MS) {
      link.coveredTo = to
      return
    }
    if (!commit({ items, range: { from: link.coveredTo, to }, complete: true })) {
      reclaimForDemand()
      if (!commit({ items, range: { from: link.coveredTo, to }, complete: true })) {
        capacityBlocked = desired
        publish(TRADE_STATUS.error, TRADE_MESSAGES.capacityExceeded)
        return
      }
    }
    link.coveredTo = to
    if (!loading) publish(failureMessage ? TRADE_STATUS.error : TRADE_STATUS.ready, failureMessage)
  }

  /** 标记未确认尾部；重连只补尾部缺口，已加载历史保持有效。 */
  function markGap(message: string): void {
    const from = link.coveredTo || desired?.to || Date.now()
    batches.push({
      items: [],
      range: { from, to: Math.max(from + 1, Date.now()) },
      complete: false,
    })
    link.active = false
    link.coveredTo = 0
    publish(TRADE_STATUS.gap, message)
  }

  /** 顺序请求缺失范围的最新一分钟；保留成功页，失败页不会随缩放重试。 */
  function historyDemand(range: TradeRange): TradeRange {
    // 订阅建立后的尾部由实时流负责，不随 Date.now 的变化轮询 REST。
    return hasSubscriptionClock() ? { from: range.from, to: Math.min(range.to, link.since) } : range
  }

  async function loadMissing(): Promise<void> {
    while (!disposed && desired && !capacityBlocked) {
      const missing = missingTradeRanges(historyDemand(desired), [
        ...batches.filter((batch) => batch.complete).map((batch) => batch.range),
        ...failed,
      ])
      const gap = missing[missing.length - 1]
      if (!gap) break
      const pageFrom = Math.floor((gap.to - 1) / TRADE_HISTORY_PAGE_MS) * TRADE_HISTORY_PAGE_MS
      const range = { from: Math.max(gap.from, pageFrom), to: gap.to }
      const controller = new AbortController()
      request = controller
      publish(TRADE_STATUS.loading, failureMessage)
      try {
        const fetched = await source.fetch({ instrument, range, signal: controller.signal })
        if (disposed) return
        if (!commit(fetched)) {
          reclaimForDemand()
          if (!commit(fetched)) {
            capacityBlocked = { ...desired }
            failureMessage = TRADE_MESSAGES.capacityExceeded
            break
          }
        }
        // 首次历史页追上订阅时刻后，连续实时成交可从该水位延续。
        if (
          link.active &&
          link.coveredTo === 0 &&
          pending.some((trade) => trade.timestamp >= range.to)
        )
          link.coveredTo = range.to
        const tail = pending
        pending = []
        appendLive(tail)
        publish(TRADE_STATUS.loading, failureMessage)
      } catch (error) {
        if (disposed || controller.signal.aborted) return
        failed.push({
          from: Math.floor(range.from / TRADE_HISTORY_PAGE_MS) * TRADE_HISTORY_PAGE_MS,
          to: Math.ceil(range.to / TRADE_HISTORY_PAGE_MS) * TRADE_HISTORY_PAGE_MS,
        })
        failureMessage = error instanceof Error ? error.message : String(error)
        // 首个错误停止当前加载；后续手势可加载其他区间，但失败页本身不会反复请求。
        break
      } finally {
        if (request === controller) request = null
      }
    }
    if (!disposed) {
      const relevantFailure =
        desired &&
        (capacityBlocked ||
          failed.some((range) => range.from < desired!.to && range.to > desired!.from))
      publish(
        relevantFailure ? TRADE_STATUS.error : link.active ? TRADE_STATUS.ready : TRADE_STATUS.gap,
        relevantFailure ? failureMessage : null,
      )
    }
  }

  /** 更新需求并复用单个在途任务；滚动不取消并重启同一请求。 */
  async function ensureRange(range: TradeRange): Promise<void> {
    if (disposed || !validTickSize || range.to <= range.from) return
    desired = range
    if (capacityBlocked) {
      if (range.to - range.from >= capacityBlocked.to - capacityBlocked.from) return
      capacityBlocked = null
      failureMessage = null
      reclaimForDemand()
    }
    if (loading) return loading
    const missing = missingTradeRanges(historyDemand(range), [
      ...batches.filter((batch) => batch.complete).map((batch) => batch.range),
      ...failed,
    ])
    if (missing.length === 0) return
    loading = loadMissing().finally(() => {
      loading = null
    })
    return loading
  }

  const unsubscribe = stream.subscribe((frame) => {
    if (disposed) return
    if (frame.type === 'status') {
      if (frame.code === 'DISCONNECTED' || frame.complete === false)
        markGap(frame.message ?? '成交流存在缺口')
      if (frame.code === 'CONNECTED') {
        link.active = true
        link.since = Date.now()
        // 重连保留旧水位；下一批连续成交或历史补页确认新的覆盖。
        if (desired && snapshot.peek().status !== TRADE_STATUS.error && !loading)
          void ensureRange(desired)
      }
      return
    }
    const accepted: MarketTrade[] = []
    let sequenceGap = false
    for (const trade of frame.trades) {
      const id = BigInt(trade.tradeId)
      if (lastID !== null && id <= lastID) continue
      if (lastID !== null && id !== lastID + 1n) {
        markGap('逐笔成交 ID 不连续')
        link.since = trade.timestamp
        sequenceGap = true
        // 断序后不能用后续实时帧伪造连续覆盖。
        link.coveredTo = 0
      }
      lastID = id
      accepted.push(trade)
    }
    if (accepted.length > 0 && link.coveredTo === 0) {
      link.active = true
      link.coveredTo =
        link.since > 0 ? Math.min(link.since, accepted[0]!.timestamp) : accepted[0]!.timestamp
    }
    if (hasLiveCoverage()) appendLive(accepted)
    else if (loading) {
      pending.push(...accepted)
      if (pending.length > TRADE_MEMORY_BUDGET.pendingTrades) {
        pending = []
        failureMessage = TRADE_MESSAGES.pendingOverflow
        request?.abort()
        capacityBlocked = desired
        publish(TRADE_STATUS.error, failureMessage)
      }
    }
    if (sequenceGap && desired) void ensureRange(desired)
  })

  return {
    snapshot,
    ensureRange,
    /** 显式回收入口，仅预算管理调用；不再随每次视口变化删除缓存。 */
    retainFrom(timestamp) {
      batches = batches
        .filter((batch) => batch.range.to > timestamp)
        .map((batch) => ({
          ...batch,
          range: { from: Math.max(timestamp, batch.range.from), to: batch.range.to },
          items: batch.items.filter((trade) => trade.timestamp >= timestamp),
        }))
      ids = new Set(batches.flatMap((batch) => batch.items.map((trade) => trade.tradeId)))
      publish(snapshot.peek().status, snapshot.peek().message)
    },
    dispose() {
      if (disposed) return
      disposed = true
      request?.abort()
      unsubscribe()
      stream.close()
      batches = []
      ids.clear()
      pending = []
    },
  }
}
