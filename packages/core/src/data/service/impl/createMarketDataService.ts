/**
 * 行情服务实现：唯一持有缓存、序列缓冲与实时订阅的模块。
 *
 * 图表、计算与警报都从这里取数；任何调用方都不再自行查询 Provider 或订阅流。
 */
import type { SymbolSpec } from '@/controllers/types.js'
import type { MarketSessionRegistry } from '@/foundation/config/marketSession/marketSessionRegistry.js'
import { asReadonlySignal, createSignal, type WritableSignal } from '@/foundation/reactivity/signal.js'
import { formatDateInTimeZone } from '@/foundation/time/index.js'
import type { Clock } from '@/foundation/utils/clock.js'
import type { KLineData } from '@/foundation/types/price.js'
import type { KLineBuffer } from '../../buffer/types.js'
import { DataBuffer } from '../../buffer/impl/dataBuffer.js'
import type { BarsCacheQuery, BarsCacheResult } from '../../buffer/types.js'
import { MarketDataCache } from '../../buffer/impl/marketDataCache.js'
import { TimeShareBuffer as TimeShareBufferImpl } from '../../buffer/impl/timeShareBuffer.js'
import {
  type BarsSelection,
  instrumentKeyFromSpec,
  LATEST_TRADING_DATE,
  SERIES_SELECTION_KIND,
  seriesSelectionKey,
  type TradesSelection,
} from '../../buffer/seriesSelection.js'
import type { MarketDataProviderRegistry } from '../../provider/registry.js'
import {
  isKLineAdjustment,
  isKLinePeriod,
  OLDER_DATA_STATUS,
  type BarAggregation,
  type TradingDate,
} from '../../provider/types.js'
import type { StreamHub, StreamSubscription } from '../../stream/types.js'
import {
  TRADE_STREAM_CODES,
  type TradeRange,
  type TradeSnapshot,
  type TradeStream,
} from '../../trades/types.js'
import type {
  BarsOptions,
  BarsPage,
  BarsPageRequest,
  BarsSeries,
  BarsSymbolRequest,
  MarketDataService,
  TimeShareOptions,
  TimeShareSeries,
  TradesSeries,
} from '../types.js'

/** 创建行情服务的依赖；全部显式传入，模块内不读取任何环境默认值。 */
export interface MarketDataServiceOptions {
  readonly registry: MarketDataProviderRegistry
  readonly stream: StreamHub
  readonly marketSessions: MarketSessionRegistry
  readonly clock: Clock
}

interface BarsEntry {
  readonly selection: BarsSelection
  readonly spec: SymbolSpec
  readonly buffer: KLineBuffer
  readonly lastBarClosed: WritableSignal<boolean>
  readonly handle: BarsSeries
  readonly controller: AbortController
  readonly initialBars: number
  instrument: SymbolSpec['instrument']
  ready: Promise<void>
  refs: number
  subscription: StreamSubscription | null
  resyncing: boolean
  queued: KLineData[]
  loadingOlder: Promise<void> | null
  disposed: boolean
}

interface TimeShareEntry {
  readonly key: string
  readonly selection: TimeShareEntrySelection
  readonly handle: TimeShareSeries
  refs: number
  disposed: boolean
}

type TimeShareEntrySelection = {
  readonly kind: typeof SERIES_SELECTION_KIND.timeShare
  readonly instrumentKey: string
  readonly source: string
  readonly tradingDate: typeof LATEST_TRADING_DATE | TradingDate
}

interface TradesEntry {
  readonly selection: TradesSelection
  readonly handle: TradesSeries
  readonly controller: AbortController
  readonly stream: TradeStream | null
  readonly unsubscribe: () => void
  refs: number
  disposed: boolean
}

/** 校验周期与复权，拒绝靠缺省值猜的调用。 */
function assertBarsSpec(spec: SymbolSpec): {
  period: BarsSelection['period']
  adjustment: BarsSelection['adjustment']
} {
  const { period, adjust } = spec
  if (period === undefined || !isKLinePeriod(period)) {
    throw new TypeError(`[MarketDataService] invalid K-line period: ${String(period)}`)
  }
  if (adjust === undefined || !isKLineAdjustment(adjust)) {
    throw new TypeError(`[MarketDataService] invalid K-line adjustment: ${String(adjust)}`)
  }
  return { period, adjustment: adjust }
}

/** 生成 K 线选择；序列身份只由这里计算。 */
export function resolveBarsSelection(spec: SymbolSpec, aggregation: BarAggregation): BarsSelection {
  const { period, adjustment } = assertBarsSpec(spec)
  return {
    kind: SERIES_SELECTION_KIND.bars,
    instrumentKey: instrumentKeyFromSpec(spec),
    source: spec.instrument.source,
    period,
    adjustment,
    barAggregation: aggregation,
  }
}

/** 生成成交选择；成交只按品种与来源复用。 */
function tradesSelection(spec: SymbolSpec): TradesSelection {
  return {
    kind: SERIES_SELECTION_KIND.trades,
    instrumentKey: instrumentKeyFromSpec(spec),
    source: spec.instrument.source,
  }
}

/** 创建唯一行情服务。 */
export function createMarketDataService(options: MarketDataServiceOptions): MarketDataService {
  const cache = new MarketDataCache(options.registry)
  const bars = new Map<string, BarsEntry>()
  const timeShares = new Map<string, TimeShareEntry>()
  const trades = new Map<string, TradesEntry>()
  let disposed = false

  /** 最新交易日由品种时区与宿主时钟共同决定。 */
  function latestTradingDate(instrument: SymbolSpec['instrument']): TradingDate {
    const id = instrument.sessionId
    if (id === undefined) {
      throw new Error(`[MarketDataService] sessionId is required for "${instrument.id}" time-share`)
    }
    return formatDateInTimeZone(
      options.clock.now(),
      options.marketSessions.getRequired(id).timeZone,
    ) as TradingDate
  }

  /** 查询一页 K 线；读路径与外部查询共用同一入口。 */
  const queryBars = (query: BarsCacheQuery): Promise<BarsCacheResult> => cache.queryBars(query)
  let api: MarketDataService

  /** 读取一页历史；所有调用方共用同一缓存与在途请求。 */
  async function readPage(request: BarsPageRequest): Promise<BarsPage> {
    const { period, adjustment } = assertBarsSpec(request.spec)
    const result = await api.queryBars({
      source: request.spec.instrument.source,
      instrument: request.spec.instrument,
      symbol: request.spec.instrument.symbol,
      exchange: request.spec.instrument.exchange,
      instrumentType: request.spec.instrument.instrumentType,
      period,
      adjustment,
      barAggregation: request.aggregation,
      limit: request.limit,
      ...(request.beforeTimestamp === undefined ? {} : { beforeTimestamp: request.beforeTimestamp }),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    })
    return {
      instrument: result.instrument,
      data: result.series.data,
      older: result.series.olderData,
      timezone: result.series.timezone,
    }
  }

  /** 按来源与代码读取一页；没有描述符时由缓存路由解析品种。 */
  async function readSymbolPage(request: BarsSymbolRequest): Promise<BarsPage> {
    const result = await cache.queryBars({
      source: request.source,
      symbol: request.symbol,
      period: request.period,
      adjustment: request.adjustment,
      barAggregation: request.aggregation,
      limit: request.limit,
      ...(request.beforeTimestamp === undefined ? {} : { beforeTimestamp: request.beforeTimestamp }),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    })
    return {
      instrument: result.instrument,
      data: result.series.data,
      older: result.series.olderData,
      timezone: result.series.timezone,
    }
  }

  /** 重新拉取一页并覆盖旧窗口；重连补偿使用。 */
  async function refreshPage(request: BarsPageRequest): Promise<BarsPage> {
    const { period, adjustment } = assertBarsSpec(request.spec)
    const result = await cache.refreshBars({
      source: request.spec.instrument.source,
      instrument: request.spec.instrument,
      symbol: request.spec.instrument.symbol,
      exchange: request.spec.instrument.exchange,
      instrumentType: request.spec.instrument.instrumentType,
      period,
      adjustment,
      barAggregation: request.aggregation,
      limit: request.limit,
      ...(request.beforeTimestamp === undefined ? {} : { beforeTimestamp: request.beforeTimestamp }),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    })
    return {
      instrument: result.instrument,
      data: result.series.data,
      older: result.series.olderData,
      timezone: result.series.timezone,
    }
  }

  /** 序列是否声明了实时 K 线；源与品种都必须是明确支持。 */
  function supportsLiveBars(spec: SymbolSpec): boolean {
    const capabilities = options.registry.get(spec.instrument.source)?.source.capabilities
    return capabilities?.liveBars === true && spec.instrument.capabilities.liveBars !== false
  }

  /** 建立实时订阅；重连后先补历史，再按序重放期间收到的增量。 */
  function openStream(entry: BarsEntry, aggregation: BarAggregation): void {
    const { spec, selection, buffer } = entry
    if (!supportsLiveBars(spec)) return
    const { period, adjustment } = selection
    const subscription = options.stream.subscribe({
      source: spec.instrument.source,
      channel: 'bars',
      instrumentId: spec.instrument.id,
      period,
      barAggregation: aggregation,
      adjustment,
    })
    entry.subscription = subscription

    /** 只有仍指向本次订阅且序列未销毁时才允许写入。 */
    const current = (): boolean =>
      !entry.disposed && !entry.controller.signal.aborted && entry.subscription === subscription

    /** 增量写入：缓冲是唯一事实来源，收盘标记同步更新。 */
    const write = (incoming: readonly KLineData[], closed: boolean): void => {
      if (!current() || incoming.length === 0) return
      if (entry.resyncing) {
        entry.queued.push(...incoming)
        return
      }
      entry.lastBarClosed.set(closed)
      const result = buffer.applyRealtimeBars(incoming)
      if (result.rejected.length === 0) buffer.setError(null)
    }

    /** 重连补偿：重拉当前窗口，成功后重放积压增量。 */
    const resync = async (): Promise<void> => {
      if (entry.resyncing) return
      entry.resyncing = true
      let queued: KLineData[] = []
      try {
        const size = Math.max(buffer.getRawData().length, entry.initialBars)
        const page = await refreshPage({
          spec,
          aggregation,
          limit: size,
          signal: entry.controller.signal,
        })
        if (!current()) return
        entry.instrument = page.instrument
        buffer.replace(page.data, page.older, page.timezone)
        entry.lastBarClosed.set(false)
        queued = entry.queued.splice(0)
      } catch (error) {
        if (current()) buffer.setError(error instanceof Error ? error.message : String(error))
      } finally {
        entry.resyncing = false
      }
      if (queued.length > 0) write(queued, false)
    }

    subscription.onFrame((frame) => {
      if (!current()) return
      if (frame.type === 'snapshot') {
        write(frame.bars, false)
        return
      }
      if (frame.type === 'bar') {
        write([frame.bar], frame.state === 'closed')
        return
      }
      if (frame.type === 'status' && frame.status === 'upstream-error') {
        buffer.setError(frame.detail ?? 'Upstream stream error')
      }
    })
    subscription.onEvent((event) => {
      if (!current()) return
      if (event.kind === 'opened') {
        buffer.setError(null)
        if (event.reconnected) void resync()
        return
      }
      if (event.kind === 'lost') buffer.setError(`实时连接中断：${event.reason}`)
      else buffer.setError(`实时连接已停止：${event.reason}`)
    })
  }

  /** 向前补一页；同一序列的并发调用共享同一次请求。 */
  async function loadOlder(
    entry: BarsEntry,
    limit: number,
  ): Promise<'covered' | 'exhausted' | 'superseded'> {
    if (entry.disposed) return 'superseded'
    if (!Number.isInteger(limit) || limit < 1) {
      throw new TypeError('[MarketDataService] loadOlder limit must be a positive integer')
    }
    if (entry.loadingOlder) {
      await entry.loadingOlder
      return entry.disposed ? 'superseded' : 'covered'
    }
    entry.buffer.setLoading(true)
    try {
      await entry.ready
      if (entry.disposed) return 'superseded'
      if (entry.buffer.olderData === OLDER_DATA_STATUS.EXHAUSTED) return 'exhausted'
      const before = entry.buffer.loadedTimeRange?.earliestTs
      const task = (async () => {
        const page = await readPage({
          spec: entry.spec,
          aggregation: entry.selection.barAggregation,
          limit,
          ...(before === undefined ? {} : { beforeTimestamp: before }),
          signal: entry.controller.signal,
        })
        if (entry.disposed) return
        entry.instrument = page.instrument
        entry.buffer.mergePage(page.data, page.older, page.timezone)
      })()
      entry.loadingOlder = task
      try {
        await task
      } catch (error) {
        if (entry.disposed || entry.controller.signal.aborted) return 'superseded'
        entry.buffer.setError(error instanceof Error ? error.message : String(error))
        return 'exhausted'
      } finally {
        if (entry.loadingOlder === task) entry.loadingOlder = null
      }
      if (entry.disposed) return 'superseded'
      const after = entry.buffer.loadedTimeRange?.earliestTs
      return after === undefined || after === before ? 'exhausted' : 'covered'
    } finally {
      entry.buffer.setLoading(false)
    }
  }

  /** 释放 K 线序列；最后一个使用者离开时断开连接并删除缓冲。 */
  function releaseBars(entry: BarsEntry): void {
    if (entry.disposed) return
    entry.refs--
    if (entry.refs > 0) return
    entry.disposed = true
    entry.controller.abort()
    entry.subscription?.close()
    entry.subscription = null
    bars.delete(seriesSelectionKey(entry.selection))
    cache.repository.delete(entry.selection)
  }

  /** 创建 K 线序列；同一选择在服务内只存在一份缓冲与一条连接。 */
  function createBarsEntry(spec: SymbolSpec, selection: BarsSelection, opts: BarsOptions): BarsEntry {
    const buffer = cache.repository.getOrCreateBars(selection, () => new DataBuffer())
    buffer.setSymbol(spec)
    const capabilities = options.registry.get(spec.instrument.source)?.source.capabilities ?? null
    const lastBarClosed = createSignal(false)
    const controller = new AbortController()

    let entry: BarsEntry
    const handle: BarsSeries = {
      get data() {
        return buffer.data
      },
      get loading() {
        return buffer.loading
      },
      get lastError() {
        return buffer.lastError
      },
      get loadedTimeRange() {
        return buffer.loadedTimeRange
      },
      get olderData() {
        return buffer.olderData
      },
      get timezone() {
        return buffer.timezone
      },
      get instrument() {
        return entry.instrument
      },
      get capabilities() {
        return capabilities
      },
      lastBarClosed: asReadonlySignal(lastBarClosed),
      getRawData: () => buffer.getRawData(),
      loadOlder: (limit) => loadOlder(entry, limit),
      dispose: () => releaseBars(entry),
    }
    entry = {
      selection,
      spec,
      buffer,
      lastBarClosed,
      handle,
      controller,
      instrument: spec.instrument,
      initialBars: opts.initialBars,
      ready: Promise.resolve(),
      refs: 1,
      subscription: null,
      resyncing: false,
      queued: [],
      loadingOlder: null,
      disposed: false,
    }

    entry.ready = (async () => {
      buffer.setLoading(true)
      try {
        const page = await readPage({
          spec,
          aggregation: selection.barAggregation,
          limit: opts.initialBars,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        entry.instrument = page.instrument
        buffer.mergePage(page.data, page.older, page.timezone)
      } catch (error) {
        if (!controller.signal.aborted) {
          buffer.setError(error instanceof Error ? error.message : String(error))
        }
      } finally {
        buffer.setLoading(false)
      }
    })()

    openStream(entry, opts.aggregation)
    return entry
  }

  /** 订阅或复用一个 K 线序列。 */
  function acquireBars(spec: SymbolSpec, opts: BarsOptions): BarsSeries {
    if (disposed) throw new TypeError('[MarketDataService] service is disposed')
    const selection = resolveBarsSelection(spec, opts.aggregation)
    const key = seriesSelectionKey(selection)
    const existing = bars.get(key)
    if (existing) {
      existing.refs++
      return existing.handle
    }
    const entry = createBarsEntry(spec, selection, opts)
    bars.set(key, entry)
    return entry.handle
  }

  /** 创建分时序列；单日与多日共用同一条查询路径。 */
  function acquireTimeShare(spec: SymbolSpec, opts: TimeShareOptions): TimeShareSeries {
    if (disposed) throw new TypeError('[MarketDataService] service is disposed')
    if (!Number.isInteger(opts.days) || opts.days < 1) {
      throw new TypeError('[MarketDataService] timeShare days must be a positive integer')
    }
    const selection: TimeShareEntrySelection = {
      kind: SERIES_SELECTION_KIND.timeShare,
      instrumentKey: instrumentKeyFromSpec(spec),
      source: spec.instrument.source,
      tradingDate: opts.tradingDate ?? LATEST_TRADING_DATE,
    }
    const key = `${seriesSelectionKey(selection)}:${opts.days}`
    const existing = timeShares.get(key)
    if (existing) {
      existing.refs++
      return existing.handle
    }
    const buffer = cache.repository.getOrCreateTimeShare(selection, () => new TimeShareBufferImpl())
    const controller = new AbortController()

    let entry: TimeShareEntry
    const handle: TimeShareSeries = {
      get data() {
        return buffer.data
      },
      get loading() {
        return buffer.loading
      },
      get lastError() {
        return buffer.lastError
      },
      get range() {
        return buffer.range
      },
      getRawData: () => buffer.getRawData(),
      getPreClose: () => buffer.getPreClose(),
      dispose: () => releaseTimeShare(entry),
    }
    entry = { key, selection, handle, refs: 1, disposed: false }

    /** 单日与多日只在这里分叉；其余流程共用。 */
    const load = async (): Promise<void> => {
      buffer.setLoading(true)
      try {
        if (opts.days === 1) {
          const result = await cache.queryTimeShare({
            source: spec.instrument.source,
            instrument: spec.instrument,
            symbol: spec.instrument.symbol,
            exchange: spec.instrument.exchange,
            instrumentType: spec.instrument.instrumentType,
            ...(opts.tradingDate === undefined
              ? { resolveTradingDate: latestTradingDate }
              : { tradingDate: opts.tradingDate }),
            signal: controller.signal,
          })
          if (controller.signal.aborted) return
          buffer.setInlineData(result.series.data, result.series.preClose)
        } else {
          const result = await cache.queryTimeShareRange({
            source: spec.instrument.source,
            instrument: spec.instrument,
            symbol: spec.instrument.symbol,
            exchange: spec.instrument.exchange,
            instrumentType: spec.instrument.instrumentType,
            days: opts.days,
            ...(opts.tradingDate === undefined
              ? { resolveEndTradingDate: latestTradingDate }
              : { endTradingDate: opts.tradingDate }),
            signal: controller.signal,
          })
          if (controller.signal.aborted) return
          buffer.setRange(result.range)
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          buffer.setError(error instanceof Error ? error.message : String(error))
        }
      } finally {
        buffer.setLoading(false)
      }
    }
    void load()
    timeShares.set(key, entry)
    return handle
  }

  /** 释放分时序列。 */
  function releaseTimeShare(entry: TimeShareEntry): void {
    if (entry.disposed) return
    entry.refs--
    if (entry.refs > 0) return
    entry.disposed = true
    timeShares.delete(entry.key)
    cache.repository.delete(entry.selection)
  }

  /** 订阅或复用逐笔成交序列。 */
  function acquireTrades(spec: SymbolSpec): TradesSeries {
    if (disposed) throw new TypeError('[MarketDataService] service is disposed')
    const selection = tradesSelection(spec)
    const key = seriesSelectionKey(selection)
    const existing = trades.get(key)
    if (existing) {
      existing.refs++
      return existing.handle
    }
    const buffer = cache.getTradeBuffer(selection, spec.instrument)
    const snapshot = createSignal(cache.getTradeSnapshot(selection, buffer))
    const controller = new AbortController()
    const publish = (): void => {
      if (!controller.signal.aborted) snapshot.set(cache.getTradeSnapshot(selection, buffer))
    }
    const unsubscribeBuffer = buffer.snapshot.subscribe(publish)
    const unsubscribeQuery = cache.queryRevision.subscribe(publish)

    let entry: TradesEntry
    const handle: TradesSeries = {
      snapshot: asReadonlySignal(snapshot),
      load: (range: TradeRange) =>
        cache.queryTrades({
          selection,
          instrument: spec.instrument,
          range,
          signal: controller.signal,
        }),
      dispose: () => {
        if (entry.disposed) return
        entry.refs--
        if (entry.refs > 0) return
        entry.disposed = true
        controller.abort()
        entry.unsubscribe()
        entry.stream?.close()
        trades.delete(key)
      },
    }

    const provider = options.registry.get(spec.instrument.source)
    const hasTickSize = Number(buffer.snapshot.peek().tickSize) > 0
    const stream = hasTickSize && provider?.trades ? provider.trades.connect(spec.instrument) : null
    const unsubscribeStream =
      stream?.subscribe((frame) => {
        if (controller.signal.aborted) return
        cache.acceptTradeFrame(selection, spec.instrument, frame)
        if (frame.type === 'trades' || frame.code === TRADE_STREAM_CODES.connected) publish()
      }) ?? (() => {})
    entry = {
      selection,
      handle,
      controller,
      stream,
      refs: 1,
      disposed: false,
      unsubscribe: () => {
        unsubscribeStream()
        unsubscribeBuffer()
        unsubscribeQuery()
      },
    }
    trades.set(key, entry)
    publish()
    return handle
  }

  api = {
    bars: acquireBars,
    timeShare: acquireTimeShare,
    trades: acquireTrades,
    read: readPage,
    readSymbol: readSymbolPage,
    queryBars,
    queryBarsWindow: (query) => cache.queryBarsWindow(query),
    queryTimeShare: (query) => cache.queryTimeShare(query),
    queryTimeShareRange: (query) => cache.queryTimeShareRange(query),
    clear: () => cache.clear(),
    stats: cache.stats,
    setMaxBytes: (maxBytes) => cache.setMaxBytes(maxBytes),
    dispose() {
      if (disposed) return
      disposed = true
      for (const entry of [...bars.values()]) {
        entry.disposed = true
        entry.controller.abort()
        entry.subscription?.close()
      }
      bars.clear()
      for (const entry of [...trades.values()]) {
        entry.disposed = true
        entry.controller.abort()
        entry.unsubscribe()
        entry.stream?.close()
      }
      trades.clear()
      timeShares.clear()
      cache.destroy()
    },
  }
  return api
}
