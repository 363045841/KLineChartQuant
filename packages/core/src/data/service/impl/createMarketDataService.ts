/**
 * 行情服务实现：唯一持有缓存、序列缓冲与实时订阅的模块。
 *
 * 图表、计算与警报都从这里取数；任何调用方都不再自行查询 Provider 或订阅流。
 */
import type { SymbolSpec } from '@/data/symbolSpec.js'
import type { MarketSessionRegistry } from '@/foundation/config/marketSession/marketSessionRegistry.js'
import {
  asReadonlySignal,
  createSignal,
  type WritableSignal,
} from '@/foundation/reactivity/signal.js'
import { formatDateInTimeZone } from '@/foundation/time/index.js'
import type { KLineData } from '@/foundation/types/price.js'
import type { Clock } from '@/foundation/utils/clock.js'
import { DataBuffer } from '../../buffer/impl/dataBuffer.js'
import { MarketDataCache } from '../../buffer/impl/marketDataCache.js'
import { TimeShareBufferImpl } from '../../buffer/impl/timeShareBuffer.js'
import {
  type BarsSelection,
  instrumentKeyFromSpec,
  LATEST_TRADING_DATE,
  SERIES_SELECTION_KIND,
  seriesSelectionKey,
  type TimeShareSelection,
  type TradesSelection,
} from '../../buffer/seriesSelection.js'
import type { BarsCacheQuery, BarsCacheResult, CoverageResult, KLineBuffer } from '../../buffer/types.js'
import { DEFAULT_BAR_PAGE_LIMIT } from '../../buffer/impl/marketDataPolicy.js'
import type { MarketDataHealth } from '../../management/impl/health.js'
import type { MarketDataProviderRegistry } from '../../provider/registry.js'
import {
  type BarAggregation,
  isKLineAdjustment,
  isKLinePeriod,
  OLDER_DATA_STATUS,
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
  BarsUpdate,
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
  readonly health: Pick<MarketDataHealth, 'state'>
}

interface BarsEntry {
  readonly selection: BarsSelection
  readonly spec: SymbolSpec
  readonly buffer: KLineBuffer
  readonly controller: AbortController
  initialBars: number
  instrument: SymbolSpec['instrument']
  ready: Promise<void>
  refs: number
  liveRefs: number
  subscription: StreamSubscription | null
  catchUpOnOpen: boolean
  loadingOlder: Promise<'covered' | 'exhausted' | 'superseded'> | null
  disposed: boolean
}

interface TimeShareEntry {
  readonly handle: TimeShareSeries
  refs: number
}

interface TradesEntry {
  readonly handle: TradesSeries
  readonly controller: AbortController
  readonly stream: TradeStream | null
  readonly unsubscribe: () => void
  refs: number
  disposed: boolean
}

/** 每次获取都有自己的释放权，序列及信号仍由复用条目持有。 */
function lease<T extends { dispose(): void }>(handle: T): T {
  let released = false
  return {
    ...handle,
    dispose() {
      if (released) return
      released = true
      handle.dispose()
    },
  }
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
  const bars = new Map<string, BarsEntry>()
  const cache = new MarketDataCache(
    options.registry,
    (selection) => bars.get(seriesSelectionKey(selection))?.buffer.getRawData() ?? [],
  )
  const timeShares = new Map<string, TimeShareEntry>()
  const trades = new Map<string, TradesEntry>()
  const barListeners = new Set<(selection: BarsSelection, update: BarsUpdate | null) => void>()
  let revision = 0
  let disposed = false

  /** 一次写入只公布一份修订，实时元数据始终来自原帧。 */
  function publishBars(
    entry: BarsEntry,
    before: BarsUpdate['change'],
    frame?: Pick<BarsUpdate, 'liveBarTime' | 'closedBarTime'>,
  ): void {
    const change = entry.buffer.data.peek()
    if (change === before) return
    const update: BarsUpdate = {
      selection: entry.selection,
      instrument: entry.instrument,
      revision: ++revision,
      change,
      ...frame,
    }
    for (const listener of barListeners) listener(entry.selection, update)
  }

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
      ...(request.beforeTimestamp === undefined
        ? {}
        : { beforeTimestamp: request.beforeTimestamp }),
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
      ...(request.beforeTimestamp === undefined
        ? {}
        : { beforeTimestamp: request.beforeTimestamp }),
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
      ...(request.beforeTimestamp === undefined
        ? {}
        : { beforeTimestamp: request.beforeTimestamp }),
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
    const provider = options.registry.get(spec.instrument.source)
    return (
      provider?.source.capabilities?.liveBars === true &&
      options.registry.getConfig(spec.instrument.source).enabled &&
      spec.instrument.capabilities.liveBars !== false
    )
  }

  /** 建立实时订阅；重连后先补历史，再按序重放期间收到的增量。 */
  function openStream(entry: BarsEntry, aggregation: BarAggregation): void {
    const { spec, selection, buffer } = entry
    if (entry.disposed || entry.liveRefs === 0 || entry.subscription || !supportsLiveBars(spec)) return
    const { period, adjustment } = selection
    let reconciling = entry.catchUpOnOpen
    let catchingUp = false
    const queued: { bars: readonly KLineData[]; liveBarTime?: number; closedBarTime?: number }[] = []
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
    const write = (
      incoming: readonly KLineData[],
      liveBarTime?: number,
      closedBarTime?: number,
    ): void => {
      if (!current() || incoming.length === 0) return
      if (reconciling) {
        queued.push({ bars: incoming, liveBarTime, closedBarTime })
        return
      }
      const before = buffer.data.peek()
      const result = buffer.applyRealtimeBars(incoming)
      publishBars(entry, before, { liveBarTime, closedBarTime })
      if (result.rejected.length === 0) buffer.setError(null)
    }

    /** 连接交接时补到旧尾部，再按顺序合并实时帧。 */
    const resync = async (): Promise<void> => {
      if (catchingUp) return
      catchingUp = true
      reconciling = true
      try {
        const previous = buffer.getRawData()
        const previousTail = previous.at(-1)?.timestamp
        const page = await refreshPage({
          spec,
          aggregation,
          limit: entry.initialBars,
          signal: entry.controller.signal,
        })
        if (!current()) return
        let oldest = page
        const pages = [page.data]
        while (previousTail !== undefined && oldest.data[0] && oldest.data[0].timestamp > previousTail) {
          const cursor = oldest.data[0].timestamp
          if (oldest.older === OLDER_DATA_STATUS.EXHAUSTED) throw new Error('历史与实时数据无法衔接')
          oldest = await readPage({ spec, aggregation, limit: entry.initialBars, beforeTimestamp: cursor, signal: entry.controller.signal })
          if (!current()) return
          if (!oldest.data[0] || oldest.data[0].timestamp >= cursor) throw new Error('历史分页未覆盖实时缺口')
          pages.push(oldest.data)
        }
        entry.instrument = page.instrument
        const before = buffer.data.peek()
        const refreshed = pages.reverse().flat()
        const first = refreshed[0]
        if (!first && previousTail !== undefined) throw new Error('实时交接未返回历史数据')
        if (first) {
          const prefix = buffer.getRawData().filter((bar) => bar.timestamp < first.timestamp)
          buffer.replace([...prefix, ...refreshed], prefix.length ? buffer.olderData : oldest.older, page.timezone)
        }
        publishBars(entry, before)
        reconciling = false
        for (const frame of queued.splice(0)) write(frame.bars, frame.liveBarTime, frame.closedBarTime)
      } catch (error) {
        if (current()) buffer.setError(error instanceof Error ? error.message : String(error))
        queued.length = 0
      } finally {
        catchingUp = false
      }
    }

    subscription.onFrame((frame) => {
      if (!current()) return
      if (reconciling && !catchingUp && (frame.type === 'snapshot' || frame.type === 'bar')) {
        void resync()
      }
      if (frame.type === 'snapshot') {
        write(frame.bars)
        return
      }
      if (frame.type === 'bar') {
        write(
          [frame.bar],
          frame.bar.timestamp,
          frame.state === 'closed' ? frame.bar.timestamp : undefined,
        )
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
        if (event.reconnected || entry.catchUpOnOpen) void resync()
        return
      }
      if (event.kind === 'lost') buffer.setError(`实时连接中断：${event.reason}`)
      else buffer.setError(`实时连接已停止：${event.reason}`)
    })
  }

  /** 向前补一页；同一序列的并发调用共享同一次请求。 */
  function loadOlder(
    entry: BarsEntry,
    limit: number,
  ): Promise<'covered' | 'exhausted' | 'superseded'> {
    if (entry.disposed) return Promise.resolve('superseded')
    if (!Number.isInteger(limit) || limit < 1) {
      throw new TypeError('[MarketDataService] loadOlder limit must be a positive integer')
    }
    if (entry.loadingOlder) return entry.loadingOlder
    const task = entry.ready
      .then(async () => {
        if (entry.disposed) return 'superseded'
        if (entry.buffer.olderData === OLDER_DATA_STATUS.EXHAUSTED) return 'exhausted'
        const before = entry.buffer.loadedTimeRange?.earliestTs
        try {
          const page = await readPage({
            spec: entry.spec,
            aggregation: entry.selection.barAggregation,
            limit,
            ...(before === undefined ? {} : { beforeTimestamp: before }),
            signal: entry.controller.signal,
          })
          if (entry.disposed) return 'superseded'
          entry.instrument = page.instrument
          const previous = entry.buffer.data.peek()
          entry.buffer.mergePage(page.data, page.older, page.timezone)
          publishBars(entry, previous)
          const after = entry.buffer.loadedTimeRange?.earliestTs
          return after === undefined || after === before ? 'exhausted' : 'covered'
        } catch (error) {
          if (entry.disposed || entry.controller.signal.aborted) return 'superseded'
          entry.buffer.setError(error instanceof Error ? error.message : String(error))
          return 'exhausted'
        }
      })
      .finally(() => {
        entry.loadingOlder = null
        entry.buffer.setLoading(false)
      })
    entry.loadingOlder = task
    entry.buffer.setLoading(true)
    return task
  }

  /** 补到所有使用者要求的首屏窗口，允许数据源限制单页大小。 */
  async function coverInitialWindow(entry: BarsEntry): Promise<void> {
    await entry.ready
    while (!entry.disposed) {
      const missing = entry.initialBars - entry.buffer.getRawData().length
      if (missing <= 0 || (await loadOlder(entry, missing)) !== 'covered') return
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
    entry.buffer.dispose()
    for (const listener of barListeners) listener(entry.selection, null)
  }

  /** 创建 K 线序列；同一选择在服务内只存在一份缓冲与一条连接。 */
  function createBarsEntry(
    spec: SymbolSpec,
    selection: BarsSelection,
    opts: BarsOptions,
  ): BarsEntry {
    const buffer = new DataBuffer()
    buffer.setSymbol(spec)
    const controller = new AbortController()
    const entry: BarsEntry = {
      selection,
      spec,
      buffer,
      controller,
      instrument: spec.instrument,
      initialBars: opts.initialBars,
      ready: Promise.resolve(),
      refs: 0,
      liveRefs: 0,
      subscription: null,
      catchUpOnOpen: false,
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
        const before = buffer.data.peek()
        buffer.mergePage(page.data, page.older, page.timezone)
        publishBars(entry, before)
      } catch (error) {
        if (!controller.signal.aborted) {
          buffer.setError(error instanceof Error ? error.message : String(error))
        }
      } finally {
        buffer.setLoading(false)
      }
    })()

    return entry
  }

  /** 订阅或复用一个 K 线序列。 */
  function acquireBars(spec: SymbolSpec, opts: BarsOptions): BarsSeries {
    if (disposed) throw new TypeError('[MarketDataService] service is disposed')
    const selection = resolveBarsSelection(spec, opts.aggregation)
    const key = seriesSelectionKey(selection)
    const entry = bars.get(key) ?? createBarsEntry(spec, selection, opts)
    bars.set(key, entry)
    entry.refs++
    if (opts.initialBars > entry.initialBars) {
      entry.initialBars = opts.initialBars
      void coverInitialWindow(entry)
    }
    const { buffer } = entry
    const registry = options.registry
    let released = false
    let live = false
    let coverageTarget = Infinity
    let coverage: Promise<CoverageResult> | null = null
    async function loadCoverage(): Promise<CoverageResult> {
      await entry.ready
      while (!released) {
        const range = buffer.loadedTimeRange
        if (range && range.earliestTs <= coverageTarget) return 'covered'
        const result = await loadOlder(entry, DEFAULT_BAR_PAGE_LIMIT)
        if (released) return 'superseded'
        if (result !== 'covered') return result
      }
      return 'superseded'
    }
    function startLive(): void {
      if (released || live) return
      live = true
      entry.liveRefs++
      if (opts.deferLive) entry.catchUpOnOpen = true
      void entry.ready.then(() => openStream(entry, selection.barAggregation))
    }
    if (!opts.deferLive) startLive()
    return {
      initialHistory: entry.ready,
      startLive,
      ensureCoverageFrom(fromTime) {
        if (Number.isNaN(fromTime)) throw new TypeError('Coverage needs a valid lower bound')
        coverageTarget = Math.min(coverageTarget, fromTime)
        coverage ??= loadCoverage().finally(() => {
          coverageTarget = Infinity
          coverage = null
        })
        return coverage
      },
      data: buffer.data,
      loading: buffer.loading,
      lastError: buffer.lastError,
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
        return registry.get(selection.source)?.source.capabilities ?? null
      },
      getRawData: () => buffer.getRawData(),
      loadOlder: (limit) => (released ? Promise.resolve('superseded') : loadOlder(entry, limit)),
      dispose() {
        if (released) return
        released = true
        if (live && --entry.liveRefs === 0) {
          entry.subscription?.close()
          entry.subscription = null
        }
        releaseBars(entry)
      },
    }
  }

  /** 创建分时序列；单日与多日共用同一条查询路径。 */
  function acquireTimeShare(spec: SymbolSpec, opts: TimeShareOptions): TimeShareSeries {
    if (disposed) throw new TypeError('[MarketDataService] service is disposed')
    if (!Number.isInteger(opts.days) || opts.days < 1) {
      throw new TypeError('[MarketDataService] timeShare days must be a positive integer')
    }
    const selection: TimeShareSelection = {
      kind: SERIES_SELECTION_KIND.timeShare,
      instrumentKey: instrumentKeyFromSpec(spec),
      source: spec.instrument.source,
      tradingDate: opts.tradingDate ?? LATEST_TRADING_DATE,
    }
    const key = `${seriesSelectionKey(selection)}:${opts.days}`
    const existing = timeShares.get(key)
    if (existing) {
      existing.refs++
      return lease(existing.handle)
    }
    const buffer = new TimeShareBufferImpl()
    const controller = new AbortController()

    let entry: TimeShareEntry
    const handle: TimeShareSeries = {
      data: buffer.data,
      loading: buffer.loading,
      lastError: buffer.lastError,
      range: buffer.range,
      getRawData: () => buffer.getRawData(),
      getPreClose: () => buffer.getPreClose(),
      dispose: () => {
        if (--entry.refs > 0) return
        controller.abort()
        buffer.dispose()
        timeShares.delete(key)
      },
    }
    entry = { handle, refs: 1 }

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
    return lease(handle)
  }

  /** 订阅或复用逐笔成交序列。 */
  function acquireTrades(spec: SymbolSpec): TradesSeries {
    if (disposed) throw new TypeError('[MarketDataService] service is disposed')
    const selection = tradesSelection(spec)
    const key = seriesSelectionKey(selection)
    const existing = trades.get(key)
    if (existing) {
      existing.refs++
      return lease(existing.handle)
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
    return lease(handle)
  }

  const reconcileStreams = () => {
    for (const entry of bars.values()) {
      if (supportsLiveBars(entry.spec)) {
        void entry.ready.then(() => openStream(entry, entry.selection.barAggregation))
      }
      else if (entry.subscription) {
        entry.subscription.close()
        entry.subscription = null
      }
    }
  }
  const stopHealth = options.health.state.subscribe(reconcileStreams)
  const stopRegistry = options.registry.state.subscribe(reconcileStreams)
  api = {
    subscribeBars(listener) {
      barListeners.add(listener)
      return () => barListeners.delete(listener)
    },
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
      stopHealth()
      stopRegistry()
      barListeners.clear()
      for (const entry of [...bars.values()]) {
        entry.disposed = true
        entry.controller.abort()
        entry.subscription?.close()
        entry.buffer.dispose()
      }
      bars.clear()
      for (const entry of [...trades.values()]) {
        entry.disposed = true
        entry.controller.abort()
        entry.unsubscribe()
        entry.stream?.close()
      }
      trades.clear()
      for (const entry of timeShares.values()) {
        entry.refs = 1
        entry.handle.dispose()
      }
      cache.destroy()
    },
  }
  return api
}
