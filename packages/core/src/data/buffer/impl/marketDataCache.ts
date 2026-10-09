/** 图表实例级行情内存缓存：按领域请求补齐数据覆盖范围并复用 Provider 请求结果。 */
import type { KLineData } from '@/controllers/types.js'
import { ERROR_CODES, KLineChartError } from '@/errors.js'
import { createSignal, type ReadonlySignal } from '@/foundation/reactivity/signal.js'
import type { MarketDataProviderRegistry } from '../../provider/impl/registry.js'
import { SourceRouter } from '../../provider/impl/router.js'
import type {
  AssetClass,
  BarAggregation,
  BarSeries,
  InstrumentDescriptor,
  KLineAdjustment,
  KLinePeriod,
  OlderDataStatus,
  TimeShareRange,
  TimeShareSeries,
  TradingDate,
} from '../../provider/types.js'
import {
  AUTO_SOURCE_ID,
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

export interface BarsCacheQuery {
  readonly symbol: string
  readonly period: KLinePeriod
  readonly adjustment: KLineAdjustment
  readonly barAggregation: BarAggregation
  readonly sourceId?: string
  readonly instrument?: InstrumentDescriptor
  readonly exchange?: string
  readonly assetClass?: AssetClass
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
  readonly assetClass?: AssetClass
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
  readonly assetClass?: AssetClass
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
  readonly assetClass?: AssetClass
}): string {
  return [
    query.sourceId ?? AUTO_SOURCE_ID,
    query.instrument?.id ?? '',
    query.assetClass ?? '',
    query.exchange ?? '',
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
  })
  private lifecycleAbortController = new AbortController()
  private usedBytes = 0
  private maxBytes = DEFAULT_MARKET_DATA_CACHE_MAX_BYTES
  private destroyed = false

  /** 供设置界面观察的缓存近似内存使用量。 */
  readonly stats: ReadonlySignal<MarketDataCacheStats> = this.statsSignal

  /** 创建绑定一个 Provider Registry 的图表实例级缓存。 */
  constructor(registry: MarketDataProviderRegistry) {
    this.router = new SourceRouter(registry)
    this.registry = registry
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

  /** 查询单个交易日分时，命中后直接返回缓存快照。 */
  async queryTimeShare(query: TimeShareCacheQuery): Promise<TimeShareCacheResult> {
    this.throwIfDestroyed()
    if (!query.tradingDate && !query.resolveTradingDate) {
      throw new TypeError('[MarketDataCache] tradingDate or resolveTradingDate is required')
    }
    const key = `${cacheKey({
      ...query,
      period: 'daily',
      adjustment: 'none',
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
      assetClass: query.assetClass,
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
      period: 'daily',
      adjustment: 'none',
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
      assetClass: query.assetClass,
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
    this.pending.clear()
    this.queries.clear()
    this.queryRevisionSignal.set(this.queryRevisionSignal.peek() + 1)
    this.entries.clear()
    this.usedBytes = 0
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
    this.destroyed = true
    this.lifecycleAbortController.abort()
    this.clear()
    this.repository.dispose()
  }

  /** 确保一页请求的根数可从缓存命中，未命中时等待已有请求后重新判断。 */
  private async ensurePage(key: string, query: BarsCacheQuery): Promise<void> {
    const signal = this.requestSignal(query.signal)
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
    const previous = entry?.data ?? []
    const merged = mergeBars(previous, result.series.data)
    const progressed = merged.length > previous.length || previous.length === 0
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
        assetClass: query.assetClass,
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
    })
  }

  /** 防止图表销毁后读取或写入实例级缓存。 */
  private throwIfDestroyed(): void {
    if (this.destroyed) this.lifecycleAbortController.signal.throwIfAborted()
  }
}
