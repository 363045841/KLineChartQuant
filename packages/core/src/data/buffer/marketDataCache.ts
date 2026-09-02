/** 图表实例级行情内存缓存：按领域请求补齐数据覆盖范围并复用 Provider 请求结果。 */
import type { KLineData } from '../../controllers/types'
import { createSignal, type ReadonlySignal } from '../../foundation/reactivity/signal'
import {
  DEFAULT_MARKET_DATA_CACHE_MAX_BYTES,
  FETCH_TOTAL_ATTEMPTS,
  retryBackoffMs,
} from './marketDataPolicy'
import { SourceRouter } from '../provider/router'
import type {
  AssetClass,
  BarSeries,
  InstrumentDescriptor,
  KLineAdjustment,
  KLinePeriod,
  OlderDataStatus,
  TimeShareRange,
  TimeShareSeries,
  TradingDate,
} from '../provider/types'
import type { MarketDataProviderRegistry } from '../provider/registry'

export interface BarsCacheQuery {
  readonly symbol: string
  readonly period: KLinePeriod
  readonly adjustment: KLineAdjustment
  readonly sourceId?: string
  readonly instrument?: InstrumentDescriptor
  readonly exchange?: string
  readonly assetClass?: AssetClass
  /** 请求的根数；拉多少就请求多少，不按时间范围外推。 */
  readonly limit: number
  /** 排他上界时间戳；省略表示从数据源最新一根开始。 */
  readonly before?: number
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

type CacheEntryKind = 'bars' | 'timeShares' | 'timeShareRanges'

interface CacheEntryMetadata {
  readonly kind: CacheEntryKind
  readonly key: string
  readonly bytes: number
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
  const source = ordered ? incoming : [...incoming].sort((left, right) => left.timestamp - right.timestamp)
  const normalized: KLineData[] = []
  for (const item of source) {
    const last = normalized[normalized.length - 1]
    if (last?.timestamp === item.timestamp) normalized[normalized.length - 1] = item
    else normalized.push(item)
  }
  return normalized
}

/** 线性合并缓存与单页数据，后到的上游修正值覆盖相同时间戳的旧值。 */
function mergeBars(existing: ReadonlyArray<KLineData>, incoming: ReadonlyArray<KLineData>): KLineData[] {
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
  readonly sourceId?: string
  readonly instrument?: InstrumentDescriptor
  readonly exchange?: string
  readonly assetClass?: AssetClass
}): string {
  return [
    query.sourceId ?? 'auto',
    query.instrument?.id ?? '',
    query.assetClass ?? '',
    query.exchange ?? '',
    query.symbol,
    query.period,
    query.adjustment,
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

/** 仅允许一个覆盖请求补齐同一缓存条目，避免并发滚动重复拉取同一页。 */
export class MarketDataCache {
  private readonly router: SourceRouter
  private readonly bars = new Map<string, CacheEntry>()
  private readonly timeShares = new Map<string, TimeShareCacheResult>()
  private readonly timeShareRanges = new Map<string, TimeShareRangeCacheResult>()
  private readonly pending = new Map<string, Promise<void>>()
  private readonly entries = new Map<string, CacheEntryMetadata>()
  private readonly statsSignal = createSignal<MarketDataCacheStats>({
    usedBytes: 0,
    maxBytes: DEFAULT_MARKET_DATA_CACHE_MAX_BYTES,
    entryCount: 0,
  })
  private readonly lifecycleAbortController = new AbortController()
  private usedBytes = 0
  private maxBytes = DEFAULT_MARKET_DATA_CACHE_MAX_BYTES
  private destroyed = false

  /** 供设置界面观察的缓存近似内存使用量。 */
  readonly stats: ReadonlySignal<MarketDataCacheStats> = this.statsSignal

  /** 创建绑定一个 Provider Registry 的图表实例级缓存。 */
  constructor(registry: MarketDataProviderRegistry) {
    this.router = new SourceRouter(registry)
  }

  /** 查询一页 K 线；缓存命中该页则直接返回，否则请求 Provider 一页并合并。 */
  async queryBars(query: BarsCacheQuery): Promise<BarsCacheResult> {
    this.throwIfDestroyed()
    if (!Number.isInteger(query.limit) || query.limit < 1) {
      throw new TypeError('[MarketDataCache] limit must be a positive integer')
    }
    if (query.before !== undefined && !Number.isFinite(query.before)) {
      throw new TypeError('[MarketDataCache] before must be a finite timestamp')
    }

    const key = cacheKey(query)
    await this.ensurePage(key, query)
    this.throwIfDestroyed()
    const entry = this.bars.get(key)
    if (!entry) throw new Error('[MarketDataCache] query completed without a cache entry')
    this.touchEntry('bars', key)

    const before = query.before
    const data =
      before === undefined
        ? entry.data.slice(Math.max(0, entry.data.length - query.limit))
        : entry.data.filter((item) => item.timestamp < before).slice(-query.limit)
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
    const key = `${cacheKey({ ...query, period: 'daily', adjustment: 'none' })}:${query.tradingDate ?? 'latest'}`
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
    this.recordEntry('timeShares', key, estimateBytes(value))
    return value
  }

  /** 查询多个交易日分时，命中相同截止日和天数后直接返回缓存快照。 */
  async queryTimeShareRange(query: TimeShareRangeCacheQuery): Promise<TimeShareRangeCacheResult> {
    this.throwIfDestroyed()
    if (!query.endTradingDate && !query.resolveEndTradingDate) {
      throw new TypeError('[MarketDataCache] endTradingDate or resolveEndTradingDate is required')
    }
    const key = `${cacheKey({ ...query, period: 'daily', adjustment: 'none' })}:${query.endTradingDate ?? 'latest'}:${query.days}`
    const cached = this.timeShareRanges.get(key)
    if (cached) {
      this.touchEntry('timeShareRanges', key)
      return cached
    }
    const { provider, instrument, series: range } = await this.router.timeShareRange({
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
    this.recordEntry('timeShareRanges', key, estimateBytes(value))
    return value
  }

  /** 清空已缓存的行情快照，不中止正在执行的请求。 */
  clear(): void {
    this.bars.clear()
    this.timeShares.clear()
    this.timeShareRanges.clear()
    this.pending.clear()
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
  }

  /** 确保一页请求的根数可从缓存命中，未命中时等待已有请求后重新判断。 */
  private async ensurePage(key: string, query: BarsCacheQuery): Promise<void> {
    this.throwIfDestroyed()
    query.signal?.throwIfAborted()
    if (this.coversPage(this.bars.get(key), query)) return
    const current = this.pending.get(key)
    if (current) {
      await current
      return this.ensurePage(key, query)
    }
    const task = this.fetchPage(key, query)
    this.pending.set(key, task)
    try {
      await task
    } finally {
      if (this.pending.get(key) === task) this.pending.delete(key)
    }
  }

  /** 判断缓存是否已包含请求游标之前的根数；历史耗尽时按已有数据返回。 */
  private coversPage(entry: CacheEntry | undefined, query: BarsCacheQuery): boolean {
    if (!entry || entry.data.length === 0) return false
    // Provider 已声明无更早历史时，任何游标查询都直接返回已有数据。
    if (entry.olderData === 'exhausted') return true
    if (query.before === undefined) return entry.data.length >= query.limit
    let beforeCount = 0
    for (const item of entry.data) {
      if (item.timestamp < query.before) beforeCount++
    }
    return beforeCount >= query.limit
  }

  /** 单次请求一页 Provider 数据并合并进缓存；不按时间范围循环外推。 */
  private async fetchPage(key: string, query: BarsCacheQuery): Promise<void> {
    const entry = this.bars.get(key)
    const result = await this.requestPage(query, entry)
    this.throwIfDestroyed()
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
        timezone: result.series.timezone,
        ...(result.series.volumeUnit === undefined ? {} : { volumeUnit: result.series.volumeUnit }),
      },
      data: merged,
      olderData: result.series.olderData,
    }
    this.bars.set(key, value)
    this.recordEntry('bars', key, estimateBytes(value))
    if (result.series.data.length === 0 || result.series.olderData === 'exhausted') return
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
    let lastError: unknown
    for (let attempt = 1; attempt <= FETCH_TOTAL_ATTEMPTS; attempt++) {
      try {
        signal.throwIfAborted()
        const result = await this.router.bars({
          preferredSourceId: entry?.sourceId ?? query.sourceId,
          instrument: entry?.instrument ?? query.instrument,
          symbol: query.symbol,
          exchange: query.exchange,
          assetClass: query.assetClass,
          period: query.period,
          adjustment: query.adjustment,
          limit: query.limit,
          ...(query.before === undefined ? {} : { before: query.before }),
          signal,
        })
        return {
          sourceId: result.provider.source.id,
          instrument: result.instrument,
          series: result.series,
        }
      } catch (error) {
        lastError = error
        signal.throwIfAborted()
        if (attempt < FETCH_TOTAL_ATTEMPTS) {
          await waitForRetry(retryBackoffMs(attempt), signal)
        }
      }
    }
    throw new Error(errorMessage(lastError), { cause: lastError })
  }

  /** 在调用方取消与图表销毁之间合并请求取消信号。 */
  private requestSignal(signal: AbortSignal | undefined): AbortSignal {
    return signal ? AbortSignal.any([signal, this.lifecycleAbortController.signal]) : this.lifecycleAbortController.signal
  }

  /** 记录或更新条目大小，并在写入后淘汰最久未访问的其他缓存条目。 */
  private recordEntry(kind: CacheEntryKind, key: string, bytes: number): void {
    const id = this.entryId(kind, key)
    const previous = this.entries.get(id)
    if (previous) {
      this.usedBytes -= previous.bytes
      this.entries.delete(id)
    }
    this.entries.set(id, { kind, key, bytes })
    this.usedBytes += bytes
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
  private evictToLimit(excludedId?: string): void {
    while (this.usedBytes > this.maxBytes) {
      const candidate = [...this.entries.entries()].find(([id]) => id !== excludedId)
      if (!candidate) return
      const [id, entry] = candidate
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
