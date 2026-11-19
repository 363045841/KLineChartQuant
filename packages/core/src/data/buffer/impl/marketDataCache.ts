/** 图表实例级行情内存缓存：按领域请求补齐数据覆盖范围并复用 Provider 请求结果。 */
import type { KLineData } from '@/controllers/types.js'
import { ERROR_CODES, KLineChartError } from '@/errors.js'
import { createSignal, type ReadonlySignal } from '@/foundation/reactivity/signal.js'
import type { MarketDataProviderRegistry } from '../../provider/impl/registry.js'
import { SourceRouter } from '../../provider/impl/router.js'
import type {
  BarAggregation,
  BarSeries,
  InstrumentDescriptor,
  InstrumentType,
  OlderDataStatus,
  TimeShareRange,
  TimeShareSeries,
  TradingDate,
} from '../../provider/types.js'
import {
  AUTO_SOURCE_ID,
  KLINE_ADJUSTMENTS,
  KLINE_PERIODS,
  KLineAdjustment,
  KLinePeriod,
  OLDER_DATA_STATUS,
  ORIGINAL_BAR_AGGREGATION,
} from '../../provider/types.js'
import { createTradeBuffer } from '../../trades/impl/tradeBuffer.js'
import { missingTradeRanges, TRADE_HISTORY_PAGE_MS } from '../../trades/impl/tradeRanges.js'
import {
  TRADE_MESSAGES,
  TRADE_STATUS,
  TRADE_STREAM_CODES,
  type TradeBuffer,
  type TradeFacts,
  type TradeFrame,
  type TradeRange,
  type TradeSnapshot,
  type TradeStatus,
  type TradeUpdate,
} from '../../trades/types.js'
import { continuousTail, periodStepMs } from './barContinuity.js'
import {
  type BarCachePage,
  type BarPageStore,
  createIndexedDbBarStore,
  sameBarValues,
} from './indexedDbBarStore.js'
import {
  DEFAULT_MARKET_DATA_CACHE_MAX_BYTES,
  FETCH_TOTAL_ATTEMPTS,
  retryBackoffMs,
} from './marketDataPolicy.js'
import {
  LATEST_TRADING_DATE,
  SeriesRepository,
  seriesSelectionKey,
  type TradesSelection,
} from './seriesRepository.js'

/** 成交查询沿用公共请求生命周期，范围由成交完整性记录决定。 */
export interface TradesCacheQuery {
  readonly selection: TradesSelection
  readonly instrument: InstrumentDescriptor
  readonly range: TradeRange
  readonly signal?: AbortSignal
}

/** 落盘页超过这个年龄就抽一页回源比对，用于发现深历史被上游修正。 */
const PERSIST_STALE_PROBE_MS = 24 * 60 * 60 * 1000

/** 自动校验间隔：只回源最新页，用于发现上游对已收盘 K 线的修正。 */
const PERSIST_AUTO_VERIFY_MS = 60 * 1000

export interface BarsCacheQuery {
  readonly symbol: string
  readonly period: KLinePeriod
  readonly adjustment: KLineAdjustment
  readonly barAggregation: BarAggregation
  readonly sourceId?: string
  readonly instrument?: InstrumentDescriptor
  readonly exchange?: string
  readonly instrumentType?: InstrumentType
  /** 请求的根数；拉多少就请求多少，不按时间范围外推。 */
  readonly limit: number
  /** 排他上界时间戳；省略表示从数据源最新一根开始。 */
  readonly beforeTimestamp?: number
  readonly signal?: AbortSignal
}

export interface BarsCacheResult {
  readonly sourceId: string
  readonly instrument: InstrumentDescriptor
  readonly series: BarSeries
}

export interface TimeShareCacheQuery {
  readonly symbol: string
  readonly instrument?: InstrumentDescriptor
  readonly tradingDate?: TradingDate
  readonly resolveTradingDate?: (instrument: InstrumentDescriptor) => TradingDate
  readonly sourceId?: string
  readonly exchange?: string
  readonly instrumentType?: InstrumentType
  readonly signal?: AbortSignal
}

export interface TimeShareRangeCacheQuery {
  readonly symbol: string
  readonly instrument?: InstrumentDescriptor
  readonly endTradingDate?: TradingDate
  readonly resolveEndTradingDate?: (instrument: InstrumentDescriptor) => TradingDate
  readonly days: number
  readonly sourceId?: string
  readonly exchange?: string
  readonly instrumentType?: InstrumentType
  readonly signal?: AbortSignal
}

export interface TimeShareCacheResult {
  readonly sourceId: string
  readonly instrument: InstrumentDescriptor
  readonly series: TimeShareSeries
}

export interface TimeShareRangeCacheResult {
  readonly sourceId: string
  readonly instrument: InstrumentDescriptor
  readonly range: TimeShareRange
}

interface CacheEntry {
  sourceId: string
  instrument: InstrumentDescriptor
  series: Omit<BarSeries, 'data' | 'olderData'>
  data: KLineData[]
  olderData: OlderDataStatus
}

type CacheEntryKind = 'bars' | 'timeShares' | 'timeShareRanges' | 'trades'

/** 全部行情共用一个预算条目表；成交条目引用仓库实例，不维护第二份登记表。 */
type CacheEntryMetadata = { readonly key: string; readonly bytes: number } & (
  | { readonly kind: Exclude<CacheEntryKind, 'trades'> }
  | { readonly kind: 'trades'; readonly buffer: TradeBuffer; readonly unsubscribe: () => void }
)

/** 公共任务状态不进入原始行情存储；成交需求与失败由查询入口更新。 */
interface QueryState {
  range?: TradeRange
  loading: boolean
  message: string | null
}

/** 领域规则每次提供一个请求步骤，分页循环由公共协调器执行。 */
interface QueryPlan {
  next(): (() => Promise<void>) | null
}

/** 图表实例缓存的近似内存统计；字节数基于可序列化数据的保守估算。 */
export interface MarketDataCacheStats {
  readonly usedBytes: number
  readonly maxBytes: number
  readonly entryCount: number
  /** 落盘缓存占用字节；估算值，用于设置面板展示。 */
  readonly diskBytes: number
}

/** 将单页上游结果规范为时间升序且时间戳唯一的数据，保留同时间戳的最后一条修正值。 */
function normalizeIncomingBars(incoming: ReadonlyArray<KLineData>): KLineData[] {
  let ordered = true
  for (let index = 1; index < incoming.length; index++) {
    if (incoming[index - 1].timestamp > incoming[index].timestamp) {
      ordered = false
      break
    }
  }
  const source = ordered
    ? incoming
    : [...incoming].sort((left, right) => left.timestamp - right.timestamp)
  const normalized: KLineData[] = []
  for (const item of source) {
    const last = normalized[normalized.length - 1]
    if (last?.timestamp === item.timestamp) normalized[normalized.length - 1] = item
    else normalized.push(item)
  }
  return normalized
}

/** 线性合并缓存与单页数据，后到的上游修正值覆盖相同时间戳的旧值。 */
function mergeBars(
  existing: ReadonlyArray<KLineData>,
  incoming: ReadonlyArray<KLineData>,
): KLineData[] {
  const normalizedIncoming = normalizeIncomingBars(incoming)
  const merged: KLineData[] = []
  let existingIndex = 0
  let incomingIndex = 0

  while (existingIndex < existing.length && incomingIndex < normalizedIncoming.length) {
    const existingItem = existing[existingIndex]
    const incomingItem = normalizedIncoming[incomingIndex]
    if (existingItem.timestamp < incomingItem.timestamp) {
      merged.push(existingItem)
      existingIndex++
    } else if (existingItem.timestamp > incomingItem.timestamp) {
      merged.push(incomingItem)
      incomingIndex++
    } else {
      merged.push(incomingItem)
      existingIndex++
      incomingIndex++
    }
  }
  merged.push(...existing.slice(existingIndex), ...normalizedIncoming.slice(incomingIndex))
  return merged
}

/** 将未知异常转换为统一的展示错误。 */
function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return String(error || 'Market data request failed')
}

/** 等待重试间隔，同时允许图表销毁立即取消等待。 */
function waitForRetry(delay: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, delay)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** 计算同一逻辑序列的稳定内存 key；auto 在首个成功响应后锁定实际来源。 */
function cacheKey(query: {
  readonly symbol: string
  readonly period: string
  readonly adjustment: string
  readonly barAggregation: string
  readonly sourceId?: string
  readonly instrument?: InstrumentDescriptor
  readonly exchange?: string
  readonly instrumentType?: InstrumentType
}): string {
  return [
    query.sourceId ?? AUTO_SOURCE_ID,
    query.instrument?.id ?? '',
    query.instrument?.instrumentType ?? query.instrumentType ?? '',
    query.instrument?.exchange ?? query.exchange ?? '',
    query.symbol,
    query.period,
    query.adjustment,
    query.barAggregation,
  ].join(':')
}

/** 以 JSON 有效载荷的四倍估算对象图占用，涵盖 JS 对象和数组的额外开销。 */
function estimateBytes(value: unknown): number {
  try {
    return Math.max(1_024, JSON.stringify(value).length * 4)
  } catch {
    return 1_024
  }
}

/** 由成交事实与查询任务状态合成指标所需状态；成交存储不感知查询状态。 */
function resolveTradeStatus(facts: TradeFacts, query?: QueryState): TradeStatus {
  if (!(Number(facts.tickSize) > 0) || query?.message) return TRADE_STATUS.error
  if (query?.loading) return TRADE_STATUS.loading
  if (query?.range && missingTradeRanges(query.range, facts.coverage).length)
    return TRADE_STATUS.gap
  return TRADE_STATUS.ready
}

/** 仅允许一个覆盖请求补齐同一缓存条目，避免并发滚动重复拉取同一页。 */
export class MarketDataCache {
  readonly repository = new SeriesRepository()
  private readonly router: SourceRouter
  private readonly registry: MarketDataProviderRegistry
  private readonly bars = new Map<string, CacheEntry>()
  private readonly timeShares = new Map<string, TimeShareCacheResult>()
  private readonly timeShareRanges = new Map<string, TimeShareRangeCacheResult>()
  private readonly pending = new Map<string, Promise<void>>()
  private readonly queries = new Map<string, QueryState>()
  private readonly queryRevisionSignal = createSignal(0)
  readonly queryRevision: ReadonlySignal<number> = this.queryRevisionSignal
  private readonly entries = new Map<string, CacheEntryMetadata>()
  private readonly statsSignal = createSignal<MarketDataCacheStats>({
    usedBytes: 0,
    maxBytes: DEFAULT_MARKET_DATA_CACHE_MAX_BYTES,
    entryCount: 0,
    diskBytes: 0,
  })
  private lifecycleAbortController = new AbortController()
  private usedBytes = 0
  private maxBytes = DEFAULT_MARKET_DATA_CACHE_MAX_BYTES
  /** 落盘占用字节；每次写盘或清理后刷新。 */
  private diskBytes = 0
  /** 本会话已做过陈旧探测的选择身份，避免每次命中都回源。 */
  private readonly staleProbed = new Set<string>()
  /** 最近一次查询参数；自动校验按它回源各自的最新页。 */
  private readonly lastQueries = new Map<string, BarsCacheQuery>()
  /** 自动校验定时器与可见性监听；没有 DOM 的环境保持关闭。 */
  private autoVerifyTimer: ReturnType<typeof setInterval> | null = null
  private autoVerifyHandler: (() => void) | null = null
  private lastAutoVerifyAt = 0
  private destroyed = false
  private readonly unsubscribeRegistry: () => void

  /** 供设置界面观察的缓存近似内存使用量。 */
  readonly stats: ReadonlySignal<MarketDataCacheStats> = this.statsSignal

  /** 创建绑定一个 Provider Registry 的图表实例级缓存。 */
  constructor(
    registry: MarketDataProviderRegistry,
    /** 落盘缓存；测试与隐私模式可注入空实现关闭持久化。 */
    private readonly barStore: BarPageStore = createIndexedDbBarStore(),
  ) {
    this.router = new SourceRouter(registry)
    this.registry = registry
    // 首屏就把已有落盘占用带出来，设置面板不必等第一次取数。
    void this.refreshDiskStats()
    let previous = registry.state.peek()
    this.unsubscribeRegistry = registry.state.subscribe(() => {
      const next = registry.state.peek()
      const changedSources = [...previous.providers]
        .filter(([id, provider]) => {
          const connectionId = provider.source.connectionId ?? id
          return (
            next.providers.get(id) !== provider ||
            previous.connections.get(connectionId) !== next.connections.get(connectionId)
          )
        })
        .map(([id]) => id)
      previous = next
      if (changedSources.length) {
        this.clear()
        for (const [instrumentKey] of this.repository.snapshot.peek()) {
          for (const sourceId of changedSources)
            this.repository.deleteSource(instrumentKey, sourceId)
        }
      }
    })
    this.startAutoVerify()
  }

  /**
   * 启动自动校验：每分钟回源一次正在使用的最新页。
   *
   * 修正判定与落盘作废都复用 revalidateLatest，手动入口仍是 verifyPersistent。
   * 页面隐藏时跳过；没有 DOM 的环境（Node 测试、Worker）不起定时器。
   */
  private startAutoVerify(): void {
    if (typeof document === 'undefined' || typeof setInterval !== 'function') return
    const tick = (): void => {
      if (this.destroyed || document.hidden) return
      this.lastAutoVerifyAt = Date.now()
      void this.verifyActive()
    }
    this.autoVerifyTimer = setInterval(tick, PERSIST_AUTO_VERIFY_MS)
    this.autoVerifyHandler = () => {
      if (this.destroyed || document.hidden) return
      // 回到前台且距上次校验超过一个间隔时补一次，避免频繁切标签页反复回源。
      if (Date.now() - this.lastAutoVerifyAt < PERSIST_AUTO_VERIFY_MS) return
      tick()
    }
    document.addEventListener('visibilitychange', this.autoVerifyHandler)
  }

  /** 返回仓库中唯一的成交实例，并纳入公共缓存的内存统计与淘汰。 */
  getTradeBuffer(selection: TradesSelection, instrument: InstrumentDescriptor): TradeBuffer {
    this.throwIfDestroyed()
    const key = seriesSelectionKey(selection)
    const existing = this.repository.getTrades(selection)
    if (existing && existing.snapshot.peek().tickSize !== String(instrument.tickSize ?? 0))
      this.repository.delete(selection)
    const buffer = this.repository.getOrCreateTrades(selection, () => createTradeBuffer(instrument))
    const id = this.entryId('trades', key)
    const tracked = this.entries.get(id)
    if (tracked?.kind !== 'trades' || tracked.buffer !== buffer) {
      this.removeTradeEntry(key)
      const unsubscribe = buffer.snapshot.subscribe(() => {
        const entry = this.entries.get(id)
        if (entry?.kind !== 'trades' || entry.buffer !== buffer) return
        if (buffer.disposed) this.removeTradeEntry(key)
        else this.recordEntry({ ...entry, bytes: estimateBytes(buffer.snapshot.peek()) })
      })
      this.recordEntry({
        kind: 'trades',
        key,
        bytes: estimateBytes(buffer.snapshot.peek()),
        buffer,
        unsubscribe,
      })
    }
    this.touchEntry('trades', key)
    return buffer
  }

  /** 实时成交写入同一仓库实例，预算记录与历史写入共用。 */
  acceptTradeFrame(
    selection: TradesSelection,
    instrument: InstrumentDescriptor,
    frame: TradeFrame,
  ): void {
    const buffer = this.getTradeBuffer(selection, instrument)
    try {
      this.commitTrades(selection, buffer, () => buffer.prepareFrame(frame))
    } catch (error) {
      // 被拒绝的实时帧不能推进连续性证明，后续历史需求需要补回该缺口。
      buffer
        .prepareFrame({ type: 'status', code: TRADE_STREAM_CODES.gap, complete: false })
        .commit()
      this.setQueryState(seriesSelectionKey(selection), {
        loading: false,
        message: errorMessage(error),
      })
    }
  }

  /** 合成指标输入；事实来自唯一存储，状态来自公共查询任务。 */
  getTradeSnapshot(selection: TradesSelection, buffer: TradeBuffer): TradeSnapshot {
    const query = this.queries.get(seriesSelectionKey(selection))
    const facts = buffer.snapshot.peek()
    const validTick = Number(facts.tickSize) > 0
    return {
      ...facts,
      status: resolveTradeStatus(facts, query),
      message: validTick ? (query?.message ?? null) : TRADE_MESSAGES.tickSizeInvalid,
    }
  }

  /** 查询状态的唯一发布入口，指标投影订阅此版本而不修改成交事实。 */
  private setQueryState(key: string, patch: Partial<QueryState>): void {
    this.queries.set(key, { loading: false, message: null, ...this.queries.get(key), ...patch })
    this.queryRevisionSignal.set(this.queryRevisionSignal.peek() + 1)
  }

  /** 成交历史和实时共用预算准入：回收其他条目与屏外数据后，再准备并提交候选更新。 */
  private commitTrades(
    selection: TradesSelection,
    buffer: TradeBuffer,
    prepare: () => TradeUpdate,
  ): void {
    const key = seriesSelectionKey(selection)
    const id = this.entryId('trades', key)
    let update = prepare()
    let bytes = estimateBytes(update.facts)
    const range = this.queries.get(key)?.range
    if (bytes > this.maxBytes && range && buffer.retain(range)) {
      update = prepare()
      bytes = estimateBytes(update.facts)
    }
    const reserved = this.entries.get(id)?.bytes ?? 0
    this.evictToLimit(id, Math.max(0, bytes - reserved))
    if (this.usedBytes - reserved + bytes > this.maxBytes)
      throw new KLineChartError(ERROR_CODES.FETCH_FAILED, TRADE_MESSAGES.capacityExceeded)
    update.commit()
  }

  /** 逐页补齐当前成交需求；成功页即时发布，失败不伪造覆盖，也不永久排除范围。 */
  async queryTrades(query: TradesCacheQuery): Promise<void> {
    const buffer = this.getTradeBuffer(query.selection, query.instrument)
    const key = seriesSelectionKey(query.selection)
    this.setQueryState(key, { range: query.range })
    const signal = this.requestSignal(query.signal)
    const provider = this.registry.get(query.instrument.sourceId)
    if (!provider?.trades) {
      this.setQueryState(key, { loading: false, message: TRADE_MESSAGES.unsupportedRaw })
      throw new KLineChartError(ERROR_CODES.UNSUPPORTED_CAPABILITY, TRADE_MESSAGES.unsupportedRaw)
    }
    const source = provider.trades
    await this.ensureQuery(key, signal, {
      next: () => {
        const requested = this.queries.get(key)?.range
        if (buffer.disposed || Number(buffer.snapshot.peek().tickSize) <= 0 || !requested)
          return null
        const demand = {
          from: requested.from,
          to: Math.min(requested.to, buffer.historyBoundary ?? requested.to),
        }
        const missing = missingTradeRanges(demand, buffer.snapshot.peek().coverage)
        const gap = missing[missing.length - 1]
        if (!gap) return null
        const from = Math.max(
          gap.from,
          Math.floor((gap.to - 1) / TRADE_HISTORY_PAGE_MS) * TRADE_HISTORY_PAGE_MS,
        )
        const range = { from, to: gap.to }
        return async () => {
          const batch = await this.requestWithRetry(signal, () =>
            source.fetch({ instrument: query.instrument, range, signal }),
          )
          signal.throwIfAborted()
          if (buffer.disposed) return
          if (!batch.complete || batch.range.from !== range.from || batch.range.to !== range.to)
            throw new KLineChartError(ERROR_CODES.FETCH_FAILED, TRADE_MESSAGES.protocolError)
          this.getTradeBuffer(query.selection, query.instrument)
          this.commitTrades(query.selection, buffer, () => buffer.prepareHistory(batch))
        }
      },
    })
  }

  /** 查询一页 K 线；缓存命中该页则直接返回，否则请求 Provider 一页并合并。 */
  async queryBars(query: BarsCacheQuery): Promise<BarsCacheResult> {
    this.throwIfDestroyed()
    if (!Number.isInteger(query.limit) || query.limit < 1) {
      throw new TypeError('[MarketDataCache] limit must be a positive integer')
    }
    if (query.beforeTimestamp !== undefined && !Number.isFinite(query.beforeTimestamp)) {
      throw new TypeError('[MarketDataCache] beforeTimestamp must be a finite timestamp')
    }

    const key = cacheKey(query)
    await this.ensurePage(key, query)
    this.throwIfDestroyed()
    const entry = this.bars.get(key)
    if (!entry) throw new Error('[MarketDataCache] query completed without a cache entry')
    this.touchEntry('bars', key)

    const beforeTimestamp = query.beforeTimestamp
    const data =
      beforeTimestamp === undefined
        ? entry.data.slice(Math.max(0, entry.data.length - query.limit))
        : entry.data.filter((item) => item.timestamp < beforeTimestamp).slice(-query.limit)
    return {
      sourceId: entry.sourceId,
      instrument: entry.instrument,
      series: { ...entry.series, data: [...data], olderData: entry.olderData },
    }
  }

  /** 实时帧回写所有指向同一事实序列的查询条目，后续历史查询不会覆盖最新尾部。 */
  acceptBars(
    selection: import('./seriesRepository.js').BarsSelection,
    instrument: InstrumentDescriptor,
    bars: readonly KLineData[],
  ): void {
    this.throwIfDestroyed()
    for (const [key, entry] of this.bars) {
      if (
        entry.sourceId !== selection.sourceId ||
        entry.instrument.id !== instrument.id ||
        entry.series.period !== selection.period ||
        entry.series.adjustment !== selection.adjustment ||
        entry.series.barAggregation !== selection.barAggregation
      )
        continue
      const value = { ...entry, data: mergeBars(entry.data, bars) }
      this.bars.set(key, value)
      this.recordEntry({ kind: 'bars', key, bytes: estimateBytes(value) })
    }
  }

  /** 查询单个交易日分时，命中后直接返回缓存快照。 */
  /** 指定序列失效后重新请求，等待旧查询完成后再撤销其缓存事实。 */
  async refreshBars(
    query: BarsCacheQuery & { sourceId: string; instrument: InstrumentDescriptor },
  ): Promise<BarsCacheResult> {
    const key = cacheKey(query)
    const keys = new Set([key])
    for (const [candidate, entry] of this.bars) {
      if (
        entry.sourceId === query.sourceId &&
        entry.instrument.id === query.instrument?.id &&
        entry.series.period === query.period &&
        entry.series.adjustment === query.adjustment &&
        entry.series.barAggregation === query.barAggregation
      )
        keys.add(candidate)
    }
    await Promise.all(
      [...keys].map((candidate) => this.pending.get(this.entryId('bars', candidate))),
    )
    query.signal?.throwIfAborted()
    for (const candidate of keys) {
      this.bars.delete(candidate)
      const id = this.entryId('bars', candidate)
      const metadata = this.entries.get(id)
      if (metadata) {
        this.usedBytes -= metadata.bytes
        this.entries.delete(id)
      }
    }
    this.publishStats()
    // 重查覆盖原窗口，但每页仍遵守源声明的最大根数。
    const maximum =
      this.registry.getRequired(query.sourceId).source.capabilities?.bars?.maxBarsPerRequest ??
      query.limit
    let result = await this.queryBars({ ...query, limit: Math.min(query.limit, maximum) })
    let data = [...result.series.data]
    while (
      data.length < query.limit &&
      result.series.olderData !== OLDER_DATA_STATUS.EXHAUSTED &&
      data.length > 0
    ) {
      const beforeTimestamp = data[0].timestamp
      result = await this.queryBars({
        ...query,
        beforeTimestamp,
        limit: Math.min(query.limit - data.length, maximum),
      })
      if (result.series.data.length === 0) break
      data = [...result.series.data, ...data]
    }
    return { ...result, series: { ...result.series, data } }
  }

  async queryTimeShare(query: TimeShareCacheQuery): Promise<TimeShareCacheResult> {
    this.throwIfDestroyed()
    if (!query.tradingDate && !query.resolveTradingDate) {
      throw new TypeError('[MarketDataCache] tradingDate or resolveTradingDate is required')
    }
    const key = `${cacheKey({
      ...query,
      period: KLinePeriod.Daily,
      adjustment: KLineAdjustment.None,
      barAggregation: ORIGINAL_BAR_AGGREGATION,
    })}:${query.tradingDate ?? LATEST_TRADING_DATE}`
    const cached = this.timeShares.get(key)
    if (cached) {
      this.touchEntry('timeShares', key)
      return cached
    }
    const result = await this.router.timeShare({
      preferredSourceId: query.sourceId,
      instrument: query.instrument,
      symbol: query.symbol,
      exchange: query.exchange,
      instrumentType: query.instrumentType,
      tradingDate: query.tradingDate,
      resolveTradingDate: query.resolveTradingDate,
      signal: this.requestSignal(query.signal),
    })
    this.throwIfDestroyed()
    const value = {
      sourceId: result.provider.source.id,
      instrument: result.instrument,
      series: result.series,
    }
    this.timeShares.set(key, value)
    this.recordEntry({ kind: 'timeShares', key, bytes: estimateBytes(value) })
    return value
  }

  /** 查询多个交易日分时，命中相同截止日和天数后直接返回缓存快照。 */
  async queryTimeShareRange(query: TimeShareRangeCacheQuery): Promise<TimeShareRangeCacheResult> {
    this.throwIfDestroyed()
    if (!query.endTradingDate && !query.resolveEndTradingDate) {
      throw new TypeError('[MarketDataCache] endTradingDate or resolveEndTradingDate is required')
    }
    const key = `${cacheKey({
      ...query,
      period: KLinePeriod.Daily,
      adjustment: KLineAdjustment.None,
      barAggregation: ORIGINAL_BAR_AGGREGATION,
    })}:${query.endTradingDate ?? LATEST_TRADING_DATE}:${query.days}`
    const cached = this.timeShareRanges.get(key)
    if (cached) {
      this.touchEntry('timeShareRanges', key)
      return cached
    }
    const {
      provider,
      instrument,
      series: range,
    } = await this.router.timeShareRange({
      preferredSourceId: query.sourceId,
      instrument: query.instrument,
      symbol: query.symbol,
      exchange: query.exchange,
      instrumentType: query.instrumentType,
      endTradingDate: query.endTradingDate,
      resolveEndTradingDate: query.resolveEndTradingDate,
      days: query.days,
      signal: this.requestSignal(query.signal),
    })
    this.throwIfDestroyed()
    const value = {
      sourceId: provider.source.id,
      instrument,
      range,
    }
    this.timeShareRanges.set(key, value)
    this.recordEntry({ kind: 'timeShareRanges', key, bytes: estimateBytes(value) })
    return value
  }

  /** 清空缓存并取消旧查询，迟到响应不得重新恢复已清空的数据。 */
  clear(): void {
    this.lifecycleAbortController.abort()
    if (!this.destroyed) this.lifecycleAbortController = new AbortController()
    for (const entry of [...this.entries.values()])
      if (entry.kind === 'trades') this.removeTradeEntry(entry.key, true)
    this.bars.clear()
    this.timeShares.clear()
    this.timeShareRanges.clear()
    this.lastQueries.clear()
    this.pending.clear()
    this.queries.clear()
    this.queryRevisionSignal.set(this.queryRevisionSignal.peek() + 1)
    this.entries.clear()
    this.usedBytes = 0
    this.publishStats()
  }

  /** 清空内存与落盘缓存；设置面板的「清除行情缓存」走这里。 */
  async clearAll(): Promise<void> {
    this.clear()
    try {
      await this.barStore.clearAll()
    } catch {
      // 落盘清理失败不影响内存已清空的结果。
    }
    this.diskBytes = 0
    this.publishStats()
  }

  /** 更新缓存上限；降低上限时立即按 LRU 淘汰已缓存条目。 */
  setMaxBytes(maxBytes: number): void {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
      throw new TypeError('[MarketDataCache] maxBytes must be a positive safe integer')
    }
    this.maxBytes = maxBytes
    this.evictToLimit()
    this.publishStats()
  }

  /** 销毁图表实例缓存，中止请求并阻止异步响应回写。 */
  destroy(): void {
    if (this.destroyed) return
    if (this.autoVerifyTimer !== null) clearInterval(this.autoVerifyTimer)
    this.autoVerifyTimer = null
    if (this.autoVerifyHandler && typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', this.autoVerifyHandler)
    this.autoVerifyHandler = null
    this.unsubscribeRegistry()
    this.destroyed = true
    this.lifecycleAbortController.abort()
    this.clear()
    this.repository.dispose()
  }

  /** 确保一页请求的根数可从缓存命中，未命中时等待已有请求后重新判断。 */
  private async ensurePage(key: string, query: BarsCacheQuery): Promise<void> {
    const signal = this.requestSignal(query.signal)
    this.lastQueries.set(key, query)
    if (!this.coversPage(this.bars.get(key), query)) await this.hydratePage(key, query)
    let completed = false
    return this.ensureQuery(this.entryId('bars', key), signal, {
      next: () =>
        completed || this.coversPage(this.bars.get(key), query)
          ? null
          : async () => {
              await this.fetchPage(key, { ...query, signal })
              completed = true
            },
    })
  }

  /**
   * 内存未命中时先读落盘页。
   *
   * 读失败或数据不足都按未命中处理，绝不阻断网络取数：落盘只是加速层。
   */
  private async hydratePage(key: string, query: BarsCacheQuery): Promise<void> {
    const stepMs = periodStepMs(query.period)
    let page: Awaited<ReturnType<BarPageStore['read']>> = null
    try {
      page = await this.barStore.read(key, {
        ...(query.beforeTimestamp === undefined ? {} : { beforeTimestamp: query.beforeTimestamp }),
        limit: query.limit,
        // 落盘读取按周期步长裁掉缺口；缺口凑不满一页时 read 返回 null，转去回源。
        ...(stepMs === null ? {} : { stepMs }),
      })
    } catch {
      return
    }
    if (page === null || page.bars.length === 0) return
    const current = this.bars.get(key)
    if (this.coversPage(current, query)) return
    // 内存侧同样不能拼接缺口：只保留末尾连续段，断开的前段交给下次回源重取。
    const data = [...continuousTail(mergeBars(current?.data ?? [], [...page.bars]), stepMs)]
    this.bars.set(key, {
      ...page.meta,
      data,
      olderData: page.olderData,
    })
    this.recordEntry({ kind: 'bars', key, bytes: estimateBytes(this.bars.get(key)!) })
    // 最新一页必须回源校验：上游修正历史时，落盘页在这里被识别并整体作废。
    if (query.beforeTimestamp === undefined) await this.revalidateLatest(key, query)
    else void this.probeStaleHistory(key, page.savedAt)
  }

  /**
   * 陈旧探测：命中较老的落盘页时，抽一页回源比对。
   *
   * 深历史修正不会与最新页重叠，靠这里按「每会话每选择一次」抽样发现；
   * 抽样只查最旧的一页，避免把一次加载放大成上百次请求。
   */
  private async probeStaleHistory(key: string, savedAt: number): Promise<void> {
    if (Date.now() - savedAt <= PERSIST_STALE_PROBE_MS || this.staleProbed.has(key)) return
    this.staleProbed.add(key)
    let pages: readonly BarCachePage[]
    try {
      pages = await this.barStore.listSelection(key)
    } catch {
      return
    }
    if (pages.length === 0) return
    // 最旧页覆盖深历史，中间页覆盖「最新页」与「最旧页」之间的盲区。
    // 取样位置取中点而不是随机数：同一份缓存每次探测的范围可复现。
    const middle = pages[Math.floor((pages.length - 1) / 2)]
    const targets = middle === pages[0] ? [pages[0]] : [pages[0], middle]
    let corrected = false
    for (const page of targets) {
      if (this.destroyed) break
      if (await this.verifyStoredPage(key, pages, page)) {
        corrected = true
        break
      }
    }
    if (corrected) this.queryRevisionSignal.set(this.queryRevisionSignal.peek() + 1)
    await this.refreshDiskStats()
  }

  /**
   * 回源校验最新页，并把新鲜值并入内存条目。
   *
   * 命中落盘页时仍要发这一次请求，代价与没有落盘时相同；它换来的是
   * 「供应商改了历史就立刻纠正」，以及落盘层收到 corrected 后整体作废。
   */
  private async revalidateLatest(key: string, query: BarsCacheQuery): Promise<boolean> {
    let result: BarsCacheResult
    try {
      result = await this.requestPage(query, this.bars.get(key))
    } catch {
      // 校验失败保留落盘值，下次加载再试。
      return false
    }
    const current = this.bars.get(key)
    const fresh = result.series.data
    if (!current || fresh.length === 0) return false
    let corrected = false
    try {
      corrected = (
        await this.barStore.write({
          selectionKey: key,
          bars: fresh,
          olderData: result.series.olderData,
          meta: {
            sourceId: result.sourceId,
            instrument: result.instrument,
            series: current.series,
          },
        })
      ).corrected
    } catch {
      corrected = false
    }
    this.bars.set(key, {
      ...current,
      data: mergeBars(current.data, fresh),
      olderData: result.series.olderData,
    })
    this.recordEntry({ kind: 'bars', key, bytes: estimateBytes(this.bars.get(key)!) })
    if (corrected) this.queryRevisionSignal.set(this.queryRevisionSignal.peek() + 1)
    return corrected
  }

  /**
   * 自动校验正在使用的选择：只回源各自最新一页。
   *
   * 与 verifyPersistent 的区别：不扫落盘全量、不重建历史，代价是每个在用选择一次请求，
   * 适合放进定时器。命中修正时落盘整段作废，并递增查询 revision 让图表重取。
   *
   * @returns corrected 至少一个选择被判定为已修正并作废
   */
  async verifyActive(): Promise<{ corrected: boolean }> {
    if (this.destroyed) return { corrected: false }
    let corrected = false
    for (const [key, query] of [...this.lastQueries]) {
      if (this.destroyed) break
      if (!this.bars.has(key)) continue
      if (await this.revalidateLatest(key, query)) corrected = true
    }
    return { corrected }
  }

  /** 把这次取到的新鲜页写入落盘缓存；失败只丢加速层，不影响本次结果。 */
  private async persistPage(
    key: string,
    entry: CacheEntry,
    fresh: readonly KLineData[],
  ): Promise<void> {
    if (fresh.length === 0) return
    try {
      await this.barStore.write({
        selectionKey: key,
        bars: fresh,
        olderData: entry.olderData,
        meta: {
          sourceId: entry.sourceId,
          instrument: entry.instrument,
          series: entry.series,
        },
      })
    } catch {
      // 落盘失败不改变取数结果。
    }
    await this.refreshDiskStats()
  }

  /** 刷新落盘占用并发布统计；读失败保留上一次的值。 */
  private async refreshDiskStats(): Promise<void> {
    try {
      this.diskBytes = (await this.barStore.stats()).bytes
    } catch {
      return
    }
    this.publishStats()
  }

  /**
   * 校验落盘历史与上游是否一致，不一致就整体作废该选择。
   *
   * 校验按页回源：同一时间窗重新取一遍，逐根比对 O/H/L/C/V。
   * 命中修正后整段选择作废，交给下次加载重新取，不在原地做逐页修补。
   *
   * @param selectionKey 目标选择身份；省略表示全部已落盘的选择
   * @param maxPages 每个选择最多校验的页数（从最旧的页开始），省略表示全部
   * @returns corrected 至少有一个选择被判定为已修正并作废
   */
  /**
   * 回源核对一页落盘数据；命中修正时作废整个选择。
   *
   * 回源缺了某个已落盘的时间戳同样算修正：落盘里有、上游没有，
   * 说明这一页已不可信，继续用就是给图表和 Agent 喂假数据。
   *
   * @param key 选择身份
   * @param pages 该选择的全部页，用于判断是否最新页
   * @param page 本次要核对的页
   * @returns 是否判定为已修正并已作废
   */
  private async verifyStoredPage(
    key: string,
    pages: readonly BarCachePage[],
    page: BarCachePage,
  ): Promise<boolean> {
    const query: BarsCacheQuery = {
      sourceId: page.meta.sourceId,
      instrument: page.meta.instrument,
      symbol: page.meta.instrument.symbol,
      exchange: page.meta.instrument.exchange,
      instrumentType: page.meta.instrument.instrumentType,
      period: page.meta.series.period,
      adjustment: page.meta.series.adjustment,
      barAggregation: page.meta.series.barAggregation,
      limit: page.bars.length,
      beforeTimestamp: page.lastTimestamp + 1,
    }
    let fresh: readonly KLineData[]
    try {
      fresh = (await this.requestPage(query, undefined)).series.data
    } catch {
      return false
    }
    const freshByTimestamp = new Map(fresh.map((bar) => [bar.timestamp, bar]))
    // 最新一页的最后一根还可能在形成中，取值变化不算历史修正。
    const isNewestPage = page.lastTimestamp === pages[pages.length - 1]?.lastTimestamp
    const comparable = isNewestPage ? page.bars.slice(0, -1) : page.bars
    const changed = comparable.some((bar) => {
      const candidate = freshByTimestamp.get(bar.timestamp)
      return candidate === undefined || !sameBarValues(bar, candidate)
    })
    if (!changed) return false
    try {
      await this.barStore.clearSelection(key)
    } catch {
      return false
    }
    return true
  }

  async verifyPersistent(
    selectionKey?: string,
    maxPages?: number,
  ): Promise<{ corrected: boolean }> {
    let selections: readonly string[]
    try {
      selections =
        selectionKey === undefined ? await this.barStore.listSelections() : [selectionKey]
    } catch {
      return { corrected: false }
    }
    let corrected = false
    for (const key of selections) {
      let pages: Awaited<ReturnType<BarPageStore['listSelection']>>
      try {
        pages = await this.barStore.listSelection(key)
      } catch {
        continue
      }
      const targets = maxPages === undefined ? pages : pages.slice(0, maxPages)
      for (const page of targets) {
        if (this.destroyed) break
        if (!(await this.verifyStoredPage(key, pages, page))) continue
        corrected = true
        break
      }
    }
    if (corrected) this.queryRevisionSignal.set(this.queryRevisionSignal.peek() + 1)
    await this.refreshDiskStats()
    return { corrected }
  }

  /** K 线和成交共用单任务协调：等待在途请求后重新检查需求，避免复制分页请求链路。 */
  private async ensureQuery(key: string, signal: AbortSignal, plan: QueryPlan): Promise<void> {
    this.throwIfDestroyed()
    signal.throwIfAborted()
    if (!plan.next()) {
      this.setQueryState(key, { loading: false, message: null })
      return
    }
    const current = this.pending.get(key)
    if (current) {
      await current
      return this.ensureQuery(key, signal, plan)
    }
    const task = this.runQuery(key, signal, plan)
    this.pending.set(key, task)
    try {
      await task
    } finally {
      if (this.pending.get(key) === task) this.pending.delete(key)
    }
  }

  /** 所有领域共用分页执行、加载状态和错误提交；领域只生成下一步请求。 */
  private async runQuery(key: string, signal: AbortSignal, plan: QueryPlan): Promise<void> {
    this.setQueryState(key, { loading: true, message: null })
    try {
      for (;;) {
        signal.throwIfAborted()
        const next = plan.next()
        if (!next) break
        await next()
      }
      this.setQueryState(key, { loading: false })
    } catch (error) {
      if (this.queries.has(key))
        this.setQueryState(key, {
          loading: false,
          message: signal.aborted ? null : errorMessage(error),
        })
      throw error
    }
  }

  /** 判断缓存是否已包含请求游标之前的根数；历史耗尽时按已有数据返回。 */
  private coversPage(entry: CacheEntry | undefined, query: BarsCacheQuery): boolean {
    if (!entry || entry.data.length === 0) return false
    // Provider 已声明无更早历史时，任何游标查询都直接返回已有数据。
    if (entry.olderData === OLDER_DATA_STATUS.EXHAUSTED) return true
    if (query.beforeTimestamp === undefined) return entry.data.length >= query.limit
    let beforeCount = 0
    for (const item of entry.data) {
      if (item.timestamp < query.beforeTimestamp) beforeCount++
    }
    return beforeCount >= query.limit
  }

  /** 单次请求一页 Provider 数据并合并进缓存；不按时间范围循环外推。 */
  private async fetchPage(key: string, query: BarsCacheQuery): Promise<void> {
    const entry = this.bars.get(key)
    const result = await this.requestPage(query, entry)
    this.throwIfDestroyed()
    query.signal?.throwIfAborted()
    const current = this.bars.get(key)
    const previous = current?.data ?? []
    let merged = mergeBars(previous, result.series.data)
    // 只重放请求期间发生的变更；普通历史页仍允许上游修正重叠数据。
    if (current !== entry) {
      const before = new Map(entry?.data.map((bar) => [bar.timestamp, bar]))
      merged = mergeBars(
        merged,
        previous.filter((bar) => before.get(bar.timestamp) !== bar),
      )
    }
    const progressed = merged.length > previous.length || previous.length === 0
    // 分页页与已有段之间可能有缺口：裁到末尾连续段，缺口不会被拼成一条序列。
    merged = [...continuousTail(merged, periodStepMs(query.period))]
    const value: CacheEntry = {
      sourceId: result.sourceId,
      instrument: result.instrument,
      series: {
        instrumentId: result.series.instrumentId,
        period: result.series.period,
        adjustment: result.series.adjustment,
        barAggregation: result.series.barAggregation,
        timezone: result.series.timezone,
        ...(result.series.volumeUnit === undefined ? {} : { volumeUnit: result.series.volumeUnit }),
      },
      data: merged,
      olderData: result.series.olderData,
    }
    this.bars.set(key, value)
    this.recordEntry({ kind: 'bars', key, bytes: estimateBytes(value) })
    // 等待落盘完成：页写入是毫秒级，换来的是缓存内容与请求顺序一致，测试与调试都确定。
    await this.persistPage(key, value, result.series.data)
    if (result.series.data.length === 0 || result.series.olderData === OLDER_DATA_STATUS.EXHAUSTED)
      return
    if (!progressed) {
      throw new Error('[MarketDataCache] Provider cursor page did not advance cached coverage')
    }
  }

  /** 执行一页 Provider 请求，并在暂时失败时在缓存层重试。 */
  private async requestPage(
    query: BarsCacheQuery,
    entry: CacheEntry | undefined,
  ): Promise<BarsCacheResult> {
    const signal = this.requestSignal(query.signal)
    return this.requestWithRetry(signal, async () => {
      const result = await this.router.bars({
        preferredSourceId: entry?.sourceId ?? query.sourceId,
        instrument: entry?.instrument ?? query.instrument,
        symbol: query.symbol,
        exchange: query.exchange,
        instrumentType: query.instrumentType,
        period: query.period,
        adjustment: query.adjustment,
        barAggregation: query.barAggregation,
        limit: query.limit,
        ...(query.beforeTimestamp === undefined ? {} : { beforeTimestamp: query.beforeTimestamp }),
        signal,
      })
      return {
        sourceId: result.provider.source.id,
        instrument: result.instrument,
        series: result.series,
      }
    })
  }

  /** 共用可取消的有限重试；失败保持为失败，不写入任何覆盖事实。 */
  private async requestWithRetry<T>(signal: AbortSignal, request: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      signal.throwIfAborted()
      try {
        const result = await request()
        signal.throwIfAborted()
        return result
      } catch (error) {
        signal.throwIfAborted()
        if (attempt >= FETCH_TOTAL_ATTEMPTS) throw error
        await waitForRetry(retryBackoffMs(attempt), signal)
      }
    }
  }

  /** 解除预算订阅并可选回收成交内容；仓库保留实例身份，实时入口可重新纳入预算。 */
  private removeTradeEntry(key: string, clear = false): void {
    const id = this.entryId('trades', key)
    const entry = this.entries.get(id)
    if (entry?.kind !== 'trades') return
    entry.unsubscribe()
    this.usedBytes -= entry.bytes
    this.entries.delete(id)
    if (clear) entry.buffer.clear()
    this.publishStats()
  }

  /** 在调用方取消与图表销毁之间合并请求取消信号。 */
  private requestSignal(signal: AbortSignal | undefined): AbortSignal {
    return signal
      ? AbortSignal.any([signal, this.lifecycleAbortController.signal])
      : this.lifecycleAbortController.signal
  }

  /** 记录或更新条目大小，并在写入后淘汰最久未访问的其他缓存条目。 */
  private recordEntry(entry: CacheEntryMetadata): void {
    const id = this.entryId(entry.kind, entry.key)
    const previous = this.entries.get(id)
    if (previous) {
      this.usedBytes -= previous.bytes
      this.entries.delete(id)
    }
    this.entries.set(id, entry)
    this.usedBytes += entry.bytes
    this.evictToLimit(id)
    this.publishStats()
  }

  /** 将命中的条目移动到 LRU 队尾。 */
  private touchEntry(kind: CacheEntryKind, key: string): void {
    const id = this.entryId(kind, key)
    const entry = this.entries.get(id)
    if (!entry) return
    this.entries.delete(id)
    this.entries.set(id, entry)
  }

  /** 超出上限时淘汰最久未访问条目；刚写入的单项允许超过上限以保证本次查询可返回。 */
  private evictToLimit(excludedId?: string, incomingBytes = 0): void {
    while (this.usedBytes + incomingBytes > this.maxBytes) {
      const candidate = [...this.entries.entries()].find(([id]) => id !== excludedId)
      if (!candidate) return
      const [id, entry] = candidate
      if (entry.kind === 'trades') {
        this.removeTradeEntry(entry.key, true)
        continue
      }
      this.entries.delete(id)
      this.usedBytes -= entry.bytes
      if (entry.kind === 'bars') this.bars.delete(entry.key)
      else if (entry.kind === 'timeShares') this.timeShares.delete(entry.key)
      else this.timeShareRanges.delete(entry.key)
    }
  }

  /** 构造跨缓存类别唯一的 LRU 条目 ID。 */
  private entryId(kind: CacheEntryKind, key: string): string {
    return `${kind}:${key}`
  }

  /** 发布缓存使用量的不可变快照。 */
  private publishStats(): void {
    this.statsSignal.set({
      usedBytes: this.usedBytes,
      maxBytes: this.maxBytes,
      entryCount: this.entries.size,
      diskBytes: this.diskBytes,
    })
  }

  /** 防止图表销毁后读取或写入实例级缓存。 */
  private throwIfDestroyed(): void {
    if (this.destroyed) this.lifecycleAbortController.signal.throwIfAborted()
  }
}
