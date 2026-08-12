import type { SymbolSpec, SymbolInfo, DataFetcher, CustomDataSource } from '../../controllers/types'
import { DataBuffer } from '../../data/buffer/dataBuffer'
import { getPeriodDays } from '../../data/buffer/dataBuffer.effects'
import type {
  BarPageRequest,
  BarPageResult,
  KLineBuffer,
  DataChange,
} from '../../data/buffer/dataBufferTypes'
import { marketDataProviderRegistry } from '../../data/provider/registry'
import { sourceRouter } from '../../data/provider/router'
import type {
  InstrumentDescriptor,
  KLineAdjustment,
  KLinePeriod,
  MarketDataProvider,
  TradingDate,
} from '../../data/provider/types'
import { TimeShareBuffer } from '../../data/buffer/timeShareBuffer'
import type { TimeShareFetcherFn, TimeShareFetchResult } from '../../data/legacy/types'
import { MarketSessionRegistry } from '../market/marketSessionRegistry'
import { createSignal, type ReadonlySignal, type Signal } from '../../foundation/reactivity/signal'
import type { KLineData, TimeShareData } from '../../foundation/types/price'
import type { ChartDom } from '../chartTypes'
import type { VisibleRange, UpdateLevel } from '../layout/pane'
import { getPhysicalKLineConfig } from '../utils/klineConfig'
import type { DataStateModule } from '../state/dataState'
import type { DataManagerStateModule } from '../state/dataManagerState'
import type { ViewportStateModule } from '../state/viewportState'
import type { ComparisonStateModule } from '../state/comparisonState'

import { comparisonBufferKey, ComparisonManager } from './comparisonManager'
import { FetchBatchScheduler } from './fetchBatchScheduler'
import { IncrementalLoadHint } from './incrementalLoadHint'
import { ScrollCompensator } from './scrollCompensator'
import { symbolSpecIdentityKey } from './symbolIdentity'

export interface DataDependencies {
  getOption: () => { kWidth: number; kGap: number }
  getDom: () => ChartDom
  /** scroll / dpr / 可见区间 / 几何 SSOT */
  viewport: ViewportStateModule
  /** 对比叠加状态 SSOT */
  comparison: ComparisonStateModule
  scheduleDraw: (level?: UpdateLevel) => void
  resetInteraction: () => void
  getIndicatorScheduler: () => {
    update: (data: KLineData[], range: VisibleRange) => boolean
    busySignal: Signal<boolean>
  }
  isPointerDown: () => boolean
  onTimeShareDataReady: (dataLength: number) => void
  onDataProcessed?: (data: KLineData[], range: VisibleRange) => void
  /** 写 symbols 选择（含 primary + comparison） */
  setSymbols: (symbols: ReadonlyArray<SymbolSpec>) => void
}

const BUF_PRIMARY = 'main'
const BUF_COMPARISON = 'cmp'
const BUF_TIMESHARE = 'ts'
const PROVIDER_MARKET_SESSIONS = new MarketSessionRegistry()

const KLINE_PERIODS = new Set<KLinePeriod>([
  '1min',
  '5min',
  '15min',
  '30min',
  '60min',
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
])

const KLINE_ADJUSTMENTS = new Set<KLineAdjustment>(['qfq', 'hfq', 'splits', 'none'])

function bufKey(
  type: string,
  market: string,
  symbol: string,
  period?: string,
  sourceId?: string,
  instrumentId?: string,
): string {
  const source = sourceId ?? ''
  const identity = instrumentId ?? `${market}:${symbol}`
  if (type === BUF_TIMESHARE) return `ts:${source}:${identity}`
  return `${type}:${source}:${identity}:${period ?? 'daily'}`
}

export class ChartDataManager {
  static readonly TRAILING_SLOTS = 30

  private _dataFetcher: DataFetcher | null = null
  private _timeShareFetcher: TimeShareFetcherFn | null = null

  private _klineBuffers = new Map<string, KLineBuffer>()
  private _tsBuffers = new Map<string, TimeShareBuffer>()
  private get _activeKey(): string | null {
    return this._dataState.readonly.activeBufferKey.peek()
  }

  private _dataState: DataStateModule
  private _dmState: DataManagerStateModule
  private _dataUnsub: (() => void) | null = null
  private _loadingUnsub: (() => void) | null = null
  private _errorUnsub: (() => void) | null = null
  private _lastDataChange: DataChange | null = null
  private _dataError = createSignal<string | null>(null)

  private _batchScheduler = new FetchBatchScheduler()
  private _scrollCompensator: ScrollCompensator
  private _comparisonManager: ComparisonManager
  private _comparisonSpecsUnsub: (() => void) | null = null
  private _loadHint: IncrementalLoadHint
  private _pendingIncrementalLoadFlushTimer = 0

  private deps: DataDependencies

  constructor(deps: DataDependencies, dataState: DataStateModule, dmState: DataManagerStateModule) {
    this.deps = deps
    this._dataState = dataState
    this._dmState = dmState
    this._scrollCompensator = new ScrollCompensator(deps)
    this._loadHint = new IncrementalLoadHint(deps)
    this._comparisonManager = new ComparisonManager({
      createComparisonBuffer: (spec) => this._createCmpBuffer(spec),
      disposeBuffer: (key) => this.disposeBuffer(key),
      getKLineBuffer: (key) => this._klineBuffers.get(key),
      getKLineBufferKeys: () => [...this._klineBuffers.keys()],
      scheduleDraw: () => this.deps.scheduleDraw(),
      getSpecs: () => this.deps.comparison.readonly.specs.peek(),
      setLoading: (loading) => this.deps.comparison.actions.setLoading(loading),
    })
    this._comparisonSpecsUnsub = this.deps.comparison.readonly.specs.subscribe(() => {
      this.reconcileComparisonBuffers()
    })
    this.reconcileComparisonBuffers()
  }

  // ── Buffer helpers ──

  private _lookupBuffer(key: string): KLineBuffer | TimeShareBuffer | undefined {
    if (key.startsWith(BUF_TIMESHARE)) return this._tsBuffers.get(key)
    return this._klineBuffers.get(key)
  }

  private _lookupKLineBuffer(key: string): KLineBuffer | undefined {
    return this._klineBuffers.get(key)
  }

  private activateBuffer(key: string): void {
    if (this._activeKey === key) return
    this.resetIncrementalLoadHintBatch()
    this.bindActiveBuffer(key)
  }

  /** 订阅当前 active buffer 的 data/loading，路径为 subscription → Action */
  private bindActiveBuffer(key: string): void {
    this.unbindActiveBuffer()
    const buf = this._lookupBuffer(key)
    if (!buf) {
      this._dataState.actions.applyActiveBufferSnapshot({
        key,
        data: [],
        loading: false,
      })
      this._dataError.set(null)
      return
    }

    this._dataUnsub = buf.data.subscribe(() => {
      this.handleBufferDataEvent(key)
    })
    this._loadingUnsub = buf.loading.subscribe(() => {
      this.handleBufferLoadingEvent(key)
    })
    this._errorUnsub = buf.lastError.subscribe(() => {
      if (this._dataState.readonly.activeBufferKey.peek() !== key) return
      this._dataError.set(buf.lastError.peek())
    })

    // 初始同步：key/data/loading 同批；subscribe 不回放当前值
    const { dataChanged, prependedCount, prevDataLength } = this.publishBufferSnapshot(
      key,
      buf,
      true,
    )
    this._dataError.set(buf.lastError.peek())
    if (dataChanged) {
      this.onBufferDataChanged(key, prevDataLength, prependedCount)
    }
    if (!buf.loading.peek()) {
      this.scheduleIncrementalLoadHintFlush(key)
    }
  }

  private unbindActiveBuffer(): void {
    this._dataUnsub?.()
    this._loadingUnsub?.()
    this._errorUnsub?.()
    this._dataUnsub = null
    this._loadingUnsub = null
    this._errorUnsub = null
    this._lastDataChange = null
  }

  private publishBufferSnapshot(
    key: string,
    buf: KLineBuffer | TimeShareBuffer,
    forceData: boolean,
  ): { dataChanged: boolean; prependedCount: number; prevDataLength: number } {
    const dataChange = buf.data.peek()
    const dataChanged = forceData || dataChange !== this._lastDataChange
    const prevDataLength = this._dataState.readonly.dataLength.peek()
    const prependedCount = dataChanged ? dataChange.prependedCount : 0
    if (dataChanged) this._lastDataChange = dataChange

    this._dataState.actions.applyActiveBufferSnapshot({
      key,
      data: dataChanged
        ? [...(dataChange.data as unknown[])]
        : this._dataState.readonly.data.peek(),
      loading: buf.loading.peek(),
    })

    return { dataChanged, prependedCount, prevDataLength }
  }

  private handleBufferDataEvent(key: string): void {
    if (this._dataState.readonly.activeBufferKey.peek() !== key) return
    const buf = this._lookupBuffer(key)
    if (!buf) return
    const { dataChanged, prependedCount, prevDataLength } = this.publishBufferSnapshot(
      key,
      buf,
      false,
    )
    if (!dataChanged) return
    this.onBufferDataChanged(key, prevDataLength, prependedCount)
  }

  private handleBufferLoadingEvent(key: string): void {
    if (this._dataState.readonly.activeBufferKey.peek() !== key) return
    const buf = this._lookupBuffer(key)
    if (!buf) return
    this.publishBufferSnapshot(key, buf, false)
    if (!buf.loading.peek()) this.scheduleIncrementalLoadHintFlush(key)
  }

  private disposeBuffer(key: string): void {
    const buf = this._lookupBuffer(key)
    if (!buf) return
    if (this._activeKey === key) {
      this.unbindActiveBuffer()
      this.resetIncrementalLoadHintBatch()
    }
    buf.dispose()
    if (key.startsWith(BUF_TIMESHARE)) this._tsBuffers.delete(key)
    else this._klineBuffers.delete(key)
  }

  private getActiveDataBuffer(): KLineBuffer | null {
    return this._activeKey && !this._activeKey.startsWith(BUF_TIMESHARE)
      ? (this._klineBuffers.get(this._activeKey) ?? null)
      : null
  }

  private getActiveTimeShareBuffer(): TimeShareBuffer | null {
    return this._activeKey?.startsWith(BUF_TIMESHARE) === true
      ? (this._tsBuffers.get(this._activeKey) ?? null)
      : null
  }

  private getPrimaryDataBuffer(spec: SymbolSpec): KLineBuffer {
    const key = bufKey(
      BUF_PRIMARY,
      spec.market,
      spec.symbol,
      spec.period,
      spec.instrument?.sourceId ?? spec.source,
      spec.id ?? spec.instrument?.id,
    )
    let buf = this._klineBuffers.get(key)
    if (!buf) {
      buf = this._createKLineBuffer()
      buf.setRequestFetch((request, page) => this.requestBars(request, page))
      this._klineBuffers.set(key, buf)
    } else {
      buf.setRequestFetch((request, page) => this.requestBars(request, page))
    }
    return buf
  }

  private _createKLineBuffer(): KLineBuffer {
    return new DataBuffer()
  }

  private _createCmpBuffer(spec: SymbolSpec): { key: string; buffer: KLineBuffer } {
    const key = comparisonBufferKey(spec)
    const buffer = this._createKLineBuffer()
    buffer.setRequestFetch((request, page) => this.requestBars(request, page))
    this._klineBuffers.set(key, buffer)
    return { key, buffer }
  }

  /** 优先使用统一 Provider 解析品种；未迁移数据源继续由旧 Fetcher 处理。 */
  private async resolveProviderInstrument(
    spec: SymbolSpec,
    capability: 'bars' | 'timeShare',
  ): Promise<{ provider: MarketDataProvider; instrument: InstrumentDescriptor } | null> {
    const sourceId = spec.source
    if (!sourceId) return null
    const provider = marketDataProviderRegistry.get(sourceId)
    if (!provider) return null

    const attached = spec.instrument
    if (attached?.sourceId === sourceId && attached.symbol === spec.symbol) {
      const supported =
        capability === 'bars'
          ? attached.capabilities.bars !== undefined
          : attached.capabilities.timeShare === true
      if (!supported) {
        throw new Error(
          `[MarketDataProvider] instrument "${attached.id}" does not support ${capability}`,
        )
      }
      return { provider, instrument: attached }
    }
    if (!provider.catalog) {
      throw new Error(`[MarketDataProvider] source "${sourceId}" cannot resolve "${spec.symbol}"`)
    }

    const candidates = await provider.catalog.search({ keyword: spec.symbol, limit: 20 })
    const instrument = candidates.find(
      (candidate) =>
        candidate.symbol === spec.symbol &&
        (spec.exchange === undefined || candidate.exchange === spec.exchange),
    )
    if (!instrument) {
      throw new Error(
        `[MarketDataProvider] instrument "${spec.symbol}" was not found in "${sourceId}"`,
      )
    }
    const supported =
      capability === 'bars'
        ? instrument.capabilities.bars !== undefined
        : instrument.capabilities.timeShare
    if (!supported) {
      throw new Error(
        `[MarketDataProvider] instrument "${instrument.id}" does not support ${capability}`,
      )
    }
    return { provider, instrument }
  }

  /** 让 K 线缓冲直接调用 Provider bars；未迁移数据源回退到旧批量 Fetcher。 */
  private async requestBars(
    spec: SymbolSpec,
    page: BarPageRequest,
  ): Promise<BarPageResult> {
    if (spec.source && spec.instrument) {
      const period = spec.period ?? 'daily'
      const adjustment = spec.adjust ?? 'none'
      if (
        !KLINE_PERIODS.has(period as KLinePeriod) ||
        !KLINE_ADJUSTMENTS.has(adjustment as KLineAdjustment)
      ) {
        throw new Error(`[MarketDataProvider] invalid bars request for "${spec.instrument.id}"`)
      }
      const result = await sourceRouter.bars({
        preferredSourceId: spec.source,
        instrument: spec.instrument,
        symbol: spec.symbol,
        exchange: spec.exchange,
        assetClass: spec.instrument.assetClass,
        period: period as KLinePeriod,
        adjustment: adjustment as KLineAdjustment,
        limit: page.limit,
        ...(page.before === undefined ? {} : { before: page.before }),
      })
      return { data: result.series.data, olderData: result.series.olderData }
    }
    if (spec.source && marketDataProviderRegistry.get(spec.source)) {
      const period = spec.period ?? 'daily'
      const adjustment = spec.adjust ?? 'none'
      if (
        !KLINE_PERIODS.has(period as KLinePeriod) ||
        !KLINE_ADJUSTMENTS.has(adjustment as KLineAdjustment)
      ) {
        throw new Error(`[MarketDataProvider] invalid bars request for "${spec.symbol}"`)
      }
      const result = await sourceRouter.bars({
        preferredSourceId: spec.source,
        symbol: spec.symbol,
        exchange: spec.exchange,
        period: period as KLinePeriod,
        adjustment: adjustment as KLineAdjustment,
        limit: page.limit,
        ...(page.before === undefined ? {} : { before: page.before }),
      })
      return { data: result.series.data, olderData: result.series.olderData }
    }
    if (!this._dataFetcher) {
      throw new Error(`[DataFetcher] source is required for symbol "${spec.symbol}"`)
    }
    // 未迁移 Fetcher 的日期区间仅存在于兼容适配边界。
    const to = page.before ?? Date.now()
    const from = to - getPeriodDays(spec.period) * 86_400_000
    return {
      data: await this._batchScheduler.createHandler()(spec, from, to),
      olderData: 'unknown',
    }
  }

  /** 将旧 YYYYMMDD 或当前品种时区日期转换为 Provider TradingDate。 */
  private resolveTradingDate(instrument: InstrumentDescriptor, date?: number): TradingDate {
    if (date !== undefined) {
      const raw = String(date)
      if (!/^\d{8}$/.test(raw))
        throw new Error(`[MarketDataProvider] invalid trading date "${date}"`)
      return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` as TradingDate
    }
    if (!instrument.sessionId) {
      throw new Error(`[MarketDataProvider] sessionId is required for "${instrument.id}" timeshare`)
    }
    const timeZone = PROVIDER_MARKET_SESSIONS.getRequired(instrument.sessionId).timeZone
    const values = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts(new Date())
        .map((part) => [part.type, part.value]),
    )
    return `${values.year}-${values.month}-${values.day}` as TradingDate
  }

  /** 让分时缓冲直接调用 Provider timeShare；未迁移数据源回退到旧 Fetcher。 */
  private async requestTimeShare(spec: SymbolSpec, date?: number): Promise<TimeShareFetchResult> {
    if (spec.source && marketDataProviderRegistry.get(spec.source)) {
      const identity = spec.instrument
        ? {
            symbol: spec.symbol,
            exchange: spec.exchange,
            assetClass: spec.instrument.assetClass,
          }
        : { symbol: spec.symbol, exchange: spec.exchange }
      const result = await sourceRouter.timeShare({
        ...identity,
        preferredSourceId: spec.source,
        instrument: spec.instrument,
        resolveTradingDate: (instrument) => this.resolveTradingDate(instrument, date),
      })
      return { data: result.series.data, preClose: result.series.preClose }
    }
    const fetcher = this._timeShareFetcher
    if (!fetcher)
      throw new Error(`[DataFetcher] "${spec.source}" does not support timeshare data fetching`)
    const result = await fetcher(spec.source ?? 'gotdx', {
      symbol: spec.symbol,
      exchange: spec.exchange,
      params: spec.params,
      date,
    })
    return 'data' in result ? result : { data: result, preClose: null }
  }

  // ── Buffer data change handler ──

  private onBufferDataChanged(key: string, prevDataLength?: number, prependedCount?: number): void {
    if (key.startsWith(BUF_TIMESHARE)) {
      this.onTimeShareBufferChanged()
      return
    }
    const buf = this._klineBuffers.get(key)
    if (!buf) return
    this.onKLineBufferChanged(key, buf, prevDataLength, prependedCount ?? 0)
  }

  private onKLineBufferChanged(
    key: string,
    buf: KLineBuffer,
    prevDataLength?: number,
    prependedCount: number = 0,
  ): void {
    if (!key.startsWith('main:')) return

    const bufferData = buf.getRawData() as KLineData[]

    if (prependedCount > 0) {
      this._scrollCompensator.compensatePrepend(prependedCount)
    } else {
      this._scrollCompensator.adjustScrollAfterDataChange(bufferData.length)
    }

    if (
      (prevDataLength ?? this._dataState.readonly.dataLength.peek()) === 0 &&
      bufferData.length > 0
    ) {
      this.scrollToRight()
    }

    this.deps.resetInteraction()

    if (!this._dmState.readonly.rangeInitialized.peek() && bufferData.length > 0) {
      this._dmState.actions.setRangeInitialized(true)
    }

    let currentRange = this.getVisibleRangeOrNull()
    if (!currentRange && this._dmState.readonly.rangeInitialized.peek() && bufferData.length > 0) {
      currentRange = { start: 0, end: bufferData.length }
    }
    if (currentRange) {
      const scheduler = this.deps.getIndicatorScheduler()
      const indicatorsReady = scheduler.update(bufferData, currentRange)
      if (indicatorsReady) {
        this.deps.scheduleDraw()
        this.deps.onDataProcessed?.(bufferData, currentRange)
      }
    }

    if (prependedCount > 0) {
      this.recordIncrementalLoad(prependedCount)
      this.checkVisibleRangeGap()
    }
  }

  private recordIncrementalLoad(prependedCount: number): void {
    this._dmState.actions.recordIncrementalLoad(
      prependedCount,
      this.deps.viewport.readonly.leftLoadBufferWidth.peek(),
    )
  }

  private scheduleIncrementalLoadHintFlush(key: string): void {
    if (
      this._dmState.readonly.pendingIncrementalLoad.peek().count <= 0 ||
      this._pendingIncrementalLoadFlushTimer !== 0
    ) {
      return
    }

    this._pendingIncrementalLoadFlushTimer = window.setTimeout(() => {
      this._pendingIncrementalLoadFlushTimer = 0
      if (this._activeKey !== key) return
      const buf = this._lookupBuffer(key)
      if (!buf || buf.loading.peek()) return
      this.flushIncrementalLoadHint()
    }, 0)
  }

  private flushIncrementalLoadHint(): void {
    const { count, leftBufferWidth } = this._dmState.actions.flushIncrementalLoad()
    if (count <= 0) return
    this._loadHint.show(count, leftBufferWidth)
  }

  private resetIncrementalLoadHintBatch(): void {
    if (this._pendingIncrementalLoadFlushTimer !== 0) {
      clearTimeout(this._pendingIncrementalLoadFlushTimer)
      this._pendingIncrementalLoadFlushTimer = 0
    }
    this._dmState.actions.resetIncrementalLoad()
    this._loadHint.hide()
  }

  private onTimeShareBufferChanged(): void {
    const data = this._dataState.readonly.data.peek() as TimeShareData[]
    this._dmState.actions.setRangeInitialized(true)
    this.deps.resetInteraction()
    this.deps.onTimeShareDataReady(data.length)
  }

  // ── Internal helpers ──

  getLeftLoadBufferWidth(): number {
    return this.deps.viewport.readonly.leftLoadBufferWidth.peek()
  }

  private getActiveKLineLength(): number {
    const buf = this.getActiveDataBuffer()
    return buf ? buf.getRawData().length : 0
  }

  /** 无 viewport / 无数据时返回 null；clamped 可索引区间（start>=0） */
  private getVisibleRangeOrNull(): VisibleRange | null {
    if (this.deps.viewport.readonly.viewWidth.peek() === 0) return null
    return this.deps.viewport.readonly.visibleRange.peek()
  }

  /** raw 可见区间（含左右扩窗，start 可能为 -1）；供增量加载左缘检测 */
  private getRawVisibleRangeOrNull(): VisibleRange | null {
    if (this.deps.viewport.readonly.viewWidth.peek() === 0) return null
    return this.deps.viewport.readonly.rawVisibleRange.peek()
  }

  /** 当前可见范围（on-demand 实时计算，消除 stale 缓存） */
  getCurrentVisibleRange(): VisibleRange | null {
    return this.getVisibleRangeOrNull()
  }

  /** Unified data signal — always reflects the active buffer's data */
  get data(): ReadonlySignal<ReadonlyArray<KLineData>> {
    return this._dataState.readonly.data as ReadonlySignal<ReadonlyArray<KLineData>>
  }

  /** Loading signal — mirrors the active buffer's loading state */
  get loading(): ReadonlySignal<boolean> {
    return this._dataState.readonly.loading
  }

  /** 主品种最近一次显式拉取失败原因 */
  get dataError(): ReadonlySignal<string | null> {
    return this._dataError
  }

  get symbols(): ReadonlySignal<ReadonlyArray<SymbolSpec>> {
    return this._dataState.readonly.symbols
  }

  get symbolCatalog(): ReadonlySignal<ReadonlyArray<SymbolInfo>> {
    return this._dataState.readonly.symbolCatalog
  }

  /**
   * Register symbols into the available catalog.
   * 优先按稳定 id 去重；旧目录结果回退到 source/market/exchange/symbol/params 身份。
   */
  registerSymbols(infos: ReadonlyArray<SymbolInfo>): void {
    const current = new Map(
      this._dataState.readonly.symbolCatalog
        .peek()
        .map((info) => [symbolSpecIdentityKey(info), info]),
    )
    for (const info of infos) current.set(symbolSpecIdentityKey(info), info)
    this._dataState.actions.setSymbolCatalog([...current.values()])
  }

  /** Remove a symbol from the catalog by code. */
  unregisterSymbol(symbol: string): void {
    const next = this._dataState.readonly.symbolCatalog.peek().filter((s) => s.symbol !== symbol)
    if (next.length < this._dataState.readonly.symbolCatalog.peek().length) {
      this._dataState.actions.setSymbolCatalog(next)
    }
  }

  get currentPeriod(): string {
    return this._dmState.readonly.currentPeriod()
  }

  /** Internal KLine data for indicator scheduler (empty in timeshare mode) */
  getInternalData(): KLineData[] {
    const buf = this.getActiveDataBuffer()
    if (buf) return buf.getRawData()
    const peek = this._dataState.readonly.data()
    return peek.length > 0 ? (peek as KLineData[]) : []
  }

  getRenderData(): unknown[] {
    return this._dataState.readonly.data.peek() as unknown[]
  }

  getMonthKeys(): Int32Array | null {
    return this.getActiveDataBuffer()?.getMonthKeys() ?? null
  }

  getDayKeys(): Int32Array | null {
    return this.getActiveDataBuffer()?.getDayKeys() ?? null
  }

  getTimeShareData(): TimeShareData[] {
    const buf = this.getActiveTimeShareBuffer()
    return buf ? buf.getRawData() : []
  }

  getTimeSharePreClose(): number | null {
    const buf = this.getActiveTimeShareBuffer()
    return buf?.getPreClose() ?? null
  }

  setTimeSharePreClose(preClose: number | null): void {
    const buf = this.getActiveTimeShareBuffer()
    if (buf) buf.setPreClose(preClose)
  }

  getTimeShareSignal(): ReadonlySignal<ReadonlyArray<TimeShareData>> {
    const buf = this.getActiveTimeShareBuffer()
    return (buf?.data ?? createSignal<ReadonlyArray<TimeShareData>>([])) as ReadonlySignal<
      ReadonlyArray<TimeShareData>
    >
  }

  getTimeShareLoadingSignal(): ReadonlySignal<boolean> {
    const buf = this.getActiveTimeShareBuffer()
    return (buf?.loading ?? createSignal<boolean>(false)) as ReadonlySignal<boolean>
  }

  setTimeShareFetcher(fetcher: TimeShareFetcherFn | null): void {
    this._timeShareFetcher = fetcher
  }

  getComparisonData(): Map<string, KLineData[]> {
    return this._comparisonManager.data
  }

  getComparisonSpecs(): SymbolSpec[] {
    return this.deps.comparison.readonly.specs.peek().map((spec) => ({ ...spec }))
  }

  get dataBuffer(): KLineBuffer {
    const buf = this.getActiveDataBuffer()
    if (buf) return buf
    const key = bufKey(BUF_PRIMARY, '', '', 'daily')
    let fallback = this._klineBuffers.get(key)
    if (!fallback) {
      fallback = this._createKLineBuffer()
      this._klineBuffers.set(key, fallback)
    }
    return fallback
  }

  get comparisonColors(): ReadonlySignal<ReadonlyMap<string, string>> {
    return this.deps.comparison.readonly.colors
  }

  get comparisonLoading(): ReadonlySignal<boolean> {
    return this.deps.comparison.readonly.loading
  }

  getComparisonColors(): Map<string, string> {
    return new Map(this.deps.comparison.readonly.colors.peek())
  }

  // ── Data updates (KLine) ──

  updateData(data: KLineData[]): void {
    if (this.currentPeriod === 'timeshare') return
    const buf = this.getActiveDataBuffer()
    if (buf) {
      buf.setInlineData(data)
    }
  }

  setData(data: KLineData[]): void {
    const buf = this.getActiveDataBuffer()
    if (buf) {
      buf.setInlineData(data)
    } else {
      this._dataState.actions.setData([...data])
    }
  }

  appendData(newData: KLineData[]): void {
    const buf = this.getActiveDataBuffer()
    if (buf) {
      const merged = [...buf.getRawData(), ...newData]
      buf.setInlineData(merged)
    } else {
      this._dataState.actions.setData([...this._dataState.readonly.data(), ...newData])
    }
  }

  getData(): KLineData[] {
    const buf = this.getActiveDataBuffer()
    return buf ? buf.getRawData() : []
  }

  // ── Fetcher ──

  setDataFetcher(fetcher: DataFetcher | null): void {
    this._dataFetcher = fetcher
    this._batchScheduler.setFetcher(fetcher)
    for (const [, buf] of this._klineBuffers) {
      buf.setRequestFetch((request, page) => this.requestBars(request, page))
    }
  }

  checkVisibleRangeGap(): void {
    const buf = this.getActiveDataBuffer()
    if (!buf) return
    const data = buf.getRawData()
    if (data.length === 0) return
    const window = buf.loadedWindow
    if (!window) return
    // 左缘扩窗检测必须用 raw（start 可为 -1）；数据下标用 clamped
    const rawRange = this.getRawVisibleRangeOrNull()
    const range = this.getVisibleRangeOrNull()
    if (!rawRange || !range) return

    const MS_PER_DAY = 86_400_000
    const spec = buf.currentSpec
    const gapDays = getPeriodDays(spec?.period)
    let firstVisibleTs: number | undefined

    if (rawRange.start < 0 && this._dataFetcher) {
      const earlierThanEarliest = window.earliestTs - gapDays * MS_PER_DAY
      buf.ensureRange(earlierThanEarliest, window.earliestTs)
      firstVisibleTs = data[0]?.timestamp
    } else if (range.start < data.length) {
      firstVisibleTs = data[range.start]?.timestamp
      if (firstVisibleTs !== undefined && firstVisibleTs < window.earliestTs) {
        buf.ensureRange(firstVisibleTs, window.earliestTs)
      }
    }

    if (firstVisibleTs === undefined) return

    this._comparisonManager.ensureRange(firstVisibleTs, window.earliestTs)
  }

  // ── Comparison management ──

  private reconcileComparisonBuffers(): void {
    const primaryBuf = this.getActiveDataBuffer()
    this._comparisonManager.reconcile(primaryBuf?.loadedWindow?.earliestTs)
  }

  addComparisonSymbol(spec: SymbolSpec): void {
    const primary = this._dataState.readonly.symbols.peek()[0]
    if (
      !primary ||
      this.deps.comparison.readonly.specs
        .peek()
        .some((item) => symbolSpecIdentityKey(item) === symbolSpecIdentityKey(spec))
    )
      return
    this.deps.setSymbols([primary, ...this.deps.comparison.readonly.specs.peek(), spec])
    // 立即重绘，让主图右轴切到百分比轴、K 线切换为折线（不依赖比较数据加载）
    this.deps.scheduleDraw()
  }

  setComparisonData(symbol: string, data: KLineData[]): void {
    const primary = this._dataState.readonly.symbols.peek()[0]
    if (!primary) return
    if (!this.deps.comparison.readonly.specs.peek().some((spec) => spec.symbol === symbol)) {
      this.deps.setSymbols([
        primary,
        ...this.deps.comparison.readonly.specs.peek(),
        { symbol, market: primary.market, period: 'daily' },
      ])
    }
    this._comparisonManager.setData(symbol, data)
  }

  removeComparisonSymbol(identity: string): void {
    const primary = this._dataState.readonly.symbols.peek()[0]
    const matches = (spec: SymbolSpec) =>
      symbolSpecIdentityKey(spec) === identity || spec.symbol === identity
    if (!primary || !this.deps.comparison.readonly.specs.peek().some(matches)) return
    this.deps.setSymbols([
      primary,
      ...this.deps.comparison.readonly.specs.peek().filter((spec) => !matches(spec)),
    ])
    this.deps.scheduleDraw()
  }

  // ── Symbol / Period ──

  setCurrentSymbol(symbol: string): void {
    const current = this._dmState.readonly.currentSpec.peek()
    if (!current) return
    this._dmState.actions.setCurrentSpec({ ...current, symbol })
    const specs = this._dataState.readonly.symbols.peek()
    if (specs.length > 0) {
      const updated = [{ ...specs[0], symbol }, ...specs.slice(1)] as SymbolSpec[]
      this.deps.setSymbols(updated)
    }
  }

  /** 进入分时模式前保存当前 K 线第一根可见数据的时间戳，用于退出后恢复滚动位置 */
  private _saveKLineScrollTimestamp(): void {
    const kBuf = this.getActiveDataBuffer()
    const rawFromBuf = kBuf?.getRawData() as KLineData[] | undefined
    const kRaw = rawFromBuf ?? (this._dataState.readonly.data() as KLineData[])
    const dataLen = kRaw?.length ?? 0
    let visibleStart = 0
    if (dataLen > 0) {
      const vRange = this.getVisibleRangeOrNull()
      visibleStart = vRange ? Math.max(0, vRange.start) : 0
    }
    // 双路径守卫：
    //   - switchToTimeShareForDate 路径：setTimeShareQueryDate 已在
    //     activateBuffer 之前调用此方法，已保存 → 跳过。
    //   - 直接 setSymbols({period:'timeshare'}) 路径：未经过
    //     setTimeShareQueryDate，_savedScrollTimestamp 为 null → 正常写入。
    if (this._dmState.readonly.savedScrollTimestamp.peek() === null) {
      this._dmState.actions.setSavedScrollTimestamp(
        kRaw && visibleStart >= 0 && visibleStart < kRaw.length
          ? kRaw[visibleStart]!.timestamp
          : null,
      )
    }
  }

  setTimeShareQueryDate(date: number): void {
    const buf = this.getActiveTimeShareBuffer()
    if (buf) {
      buf.setQueryDate(date)
    } else {
      // Save scroll timestamp before activateBuffer clears _dataSignal,
      // so setSymbols can't overwrite the saved value with empty TS data.
      this._saveKLineScrollTimestamp()

      const tsBuf = new TimeShareBuffer()
      tsBuf.setFetcher(this._timeShareFetcher)
      tsBuf.setRequestFetch((request, date) => this.requestTimeShare(request, date))
      tsBuf.setQueryDate(date)
      const spec = this._dmState.readonly.currentSpec.peek()
      if (spec) {
        const key = bufKey(
          BUF_TIMESHARE,
          spec.market,
          spec.symbol,
          undefined,
          spec.instrument?.sourceId ?? spec.source,
          spec.id ?? spec.instrument?.id,
        )
        this._tsBuffers.set(key, tsBuf)
        this.activateBuffer(key)
        // 本方法只负责"准备"（建 buffer + 设日期 + 激活），不触发拉取：
        // switchToTimeShareForDate 紧跟的 setSymbols（period=timeshare）是唯一
        // load 入口，避免同一 buffer 在首次进入分时图时被重复请求两次。
      }
    }
  }

  setCurrentPeriod(period: string): void {
    const current = this._dmState.readonly.currentSpec.peek()
    if (!current) return
    const next = { ...current, period }
    this.setSymbols([next, ...this.deps.comparison.readonly.specs.peek()])
  }

  /**
   * 归一化 K 线周期别名，防止无效 period 进入引擎
   *  "day" → "daily"，其余保持原值
   */
  private static normalizePeriod(period?: string): string {
    if (!period) return 'daily'
    const alias = period.toLowerCase().trim()
    if (alias === 'day') return 'daily'
    return period
  }

  applyCustomData(source: CustomDataSource): void {
    const plainData = source.data.map((d) => ({ ...d }))

    // 首次调用时保存原始 spec，用于切回 Fetcher 时恢复
    if (!this._dmState.readonly.preCustomSpec.peek()) {
      this._dmState.actions.setPreCustomSpec({
        ...(this._dmState.readonly.currentSpec.peek() ??
          this._dataState.readonly.symbols.peek()[0] ?? {
            symbol: source.symbol ?? '',
            market: source.market,
          }),
      })
    }

    // 每次都切到 custom 品种，注册到目录，填入数据
    const spec: SymbolSpec = {
      symbol: source.symbol ?? '',
      market: source.market,
      period: ChartDataManager.normalizePeriod(source.period),
      incremental: false,
      source: source.source ?? 'custom',
    }
    this.setSymbols([spec, ...this.deps.comparison.readonly.specs.peek()])

    const symbolCode = spec.symbol
    if (symbolCode) {
      this.registerSymbols([
        {
          symbol: symbolCode,
          market: source.market,
          description: source.description ?? symbolCode,
          exchange: source.exchange ?? '',
          source: source.source ?? 'custom',
        },
      ])
    }

    this.setData(plainData)
    if (source.comparisons) {
      for (const key of this._comparisonManager.data.keys()) {
        if (!source.comparisons[key]) this.removeComparisonSymbol(key)
      }
      for (const [symbol, data] of Object.entries(source.comparisons)) {
        this.setComparisonData(
          symbol,
          data.map((d) => ({ ...d })),
        )
      }
    }
  }

  resetToFetcher(spec: SymbolSpec): void {
    if (this._activeKey && !this._activeKey.startsWith(BUF_TIMESHARE)) {
      this.disposeBuffer(this._activeKey)
    }
    this._dataState.actions.setData([])
    this._dmState.actions.setRangeInitialized(false)
    this._dmState.actions.setSavedScrollTimestamp(null)
    this.setSymbols([spec, ...this.deps.comparison.readonly.specs.peek()])
  }

  getPreCustomSpec(): SymbolSpec | null {
    return this._dmState.readonly.preCustomSpec.peek()
  }

  // ── Main symbol switching ──

  setSymbols(specs: ReadonlyArray<SymbolSpec>): void {
    const selection = specs[0]?.period === 'timeshare' ? specs.slice(0, 1) : specs
    this.deps.setSymbols(selection)

    if (selection.length === 0) {
      this._dmState.actions.setCurrentSpec(null)
      this.disposeAllBuffers()
      this._dataState.actions.applyActiveBufferSnapshot({
        key: null,
        data: [],
        loading: false,
      })
      this._dmState.actions.setRangeInitialized(false)
      return
    }

    const primary = selection[0]!
    this._dmState.actions.setCurrentSpec(primary)

    if (primary.period === 'timeshare') {
      // Switch to timeshare mode
      // Save scroll position before activating TS buffer (which clears _dataSignal).
      // Guarded by _savedScrollTimestamp === null so setTimeShareQueryDate (which
      // calls this method first) won't be overwritten.
      this._saveKLineScrollTimestamp()
      // Keep primary KLine buffer in memory — don't dispose it,
      // so data and scroll position are preserved when user returns
      this._dataState.actions.setData([])
      this._dmState.actions.setRangeInitialized(false)

      // Get or create timeshare buffer
      const tsKey = bufKey(
        BUF_TIMESHARE,
        primary.market,
        primary.symbol,
        undefined,
        primary.instrument?.sourceId ?? primary.source,
        primary.id ?? primary.instrument?.id,
      )
      let tsBuf = this._tsBuffers.get(tsKey)
      if (!tsBuf) {
        tsBuf = new TimeShareBuffer()
        tsBuf.setFetcher(this._timeShareFetcher)
        tsBuf.setRequestFetch((request, date) => this.requestTimeShare(request, date))
        this._tsBuffers.set(tsKey, tsBuf)
      }
      this.activateBuffer(tsKey)
      tsBuf.load(primary)
      return
    }

    // KLine mode
    // Dispose timeshare buffer
    for (const [key] of this._tsBuffers) {
      this.disposeBuffer(key)
    }

    this.loadKLineSymbols(selection)
  }

  // ── KLine loading ──

  private loadKLineSymbols(specs: ReadonlyArray<SymbolSpec>): void {
    const spec = specs[0]!
    const buf = this.getPrimaryDataBuffer(spec)
    this.activateBuffer(
      bufKey(
        BUF_PRIMARY,
        spec.market,
        spec.symbol,
        spec.period,
        spec.instrument?.sourceId ?? spec.source,
        spec.id ?? spec.instrument?.id,
      ),
    )
    if (!this._dataFetcher) {
      buf.setCurrentSpec(spec)
      return
    }

    // Buffer already has data (e.g. from a previous applyCustomData setInlineData call)
    // → just update the spec metadata, skip fetch to avoid clearing inline data.
    // Preserve the buffer's existing incremental flag so inline data sources
    // (which use incremental:false) remain non-fetching even after a symbol switch.
    if (buf.getRawData().length > 0) {
      buf.setCurrentSpec({
        ...spec,
        incremental: spec.incremental ?? buf.currentSpec?.incremental ?? true,
      })
      this.deps.resetInteraction()
      // Scroll restoration from _savedScrollTimestamp is deferred to
      // chart → tryRestoreScrollFromSnapshot() so kWidth/kGap have been
      // restored by setActiveMode before scrollLeft calculation.
      if (this._dmState.readonly.savedScrollTimestamp.peek() === null) {
        this.scrollToRight()
      }
      return
    }

    if (!spec.source) {
      throw new Error(
        `[ChartDataManager] source is required for symbol "${spec.symbol}". ` +
          `Provide a source in SymbolSpec or use setData/applyCustomData for inline data.`,
      )
    }

    buf.setSymbol(spec)
  }

  /** 退出分时图时根据保存的时间戳恢复 K 线滚动位置。返回是否成功恢复。 */
  tryRestoreScrollFromSnapshot(): boolean {
    if (this._dmState.readonly.savedScrollTimestamp.peek() === null) return false
    const buf = this.getActiveDataBuffer()
    const raw = buf ? (buf.getRawData() as KLineData[]) : null
    if (!raw || raw.length === 0) return false
    const idx = raw.findIndex(
      (d) => d.timestamp >= this._dmState.readonly.savedScrollTimestamp.peek()!,
    )
    this._dmState.actions.setSavedScrollTimestamp(null)
    if (idx >= 0) {
      const dpr = this.deps.viewport.readonly.dpr.peek()
      const opt = this.deps.getOption()
      const { unitPx, startXPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)
      const leftBuffer = this.getLeftLoadBufferWidth()
      const scrollLeft = ((idx + 1) * unitPx + startXPx) / dpr + leftBuffer
      this.deps.viewport.actions.scrollTo(scrollLeft)
      return true
    }
    return false
  }

  // ── Content width ──

  getContentWidth(): number {
    return this.deps.viewport.readonly.contentWidth.peek()
  }

  scrollToRight(): void {
    const buf = this.getActiveDataBuffer()
    const dataLength = buf ? buf.getRawData().length : 0
    this._scrollCompensator.scrollToRight(dataLength)
    this.deps.scheduleDraw()
  }

  // ── Comparison price range ──

  getComparisonEquivalentPriceRange(range: VisibleRange): { min: number; max: number } | null {
    if (this._comparisonManager.specs.length === 0 || this._comparisonManager.data.size === 0)
      return null
    const buf = this.getActiveDataBuffer()
    const internalData = buf ? buf.getRawData() : []
    const baseIndex = Math.max(0, range.start)
    const baseItem = internalData[baseIndex]
    if (!baseItem || !Number.isFinite(baseItem.close) || baseItem.close <= 0) return null
    const mainBase = baseItem.close
    const baseDate = baseItem.date ?? ''

    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY

    for (const spec of this._comparisonManager.specs) {
      const data = this._comparisonManager.data.get(spec.symbol)
      if (!data?.length) continue

      const baseline = baseDate
        ? findComparisonBaselineByDate(data, baseDate)
        : findComparisonBaselineByTimestamp(data, baseItem.timestamp)
      if (!baseline || !Number.isFinite(baseline.close) || baseline.close <= 0) continue

      const byDate = new Map<string, KLineData>()
      for (const item of data) {
        if (item.date) byDate.set(item.date, item)
        else byDate.set(String(item.timestamp), item)
      }

      for (let i = Math.max(0, range.start); i < range.end && i < internalData.length; i++) {
        const mainItem = internalData[i]
        if (!mainItem) continue
        const key = mainItem.date ?? String(mainItem.timestamp)
        const item = byDate.get(key)
        if (!item || !Number.isFinite(item.close)) continue

        const pct = (item.close - baseline.close) / baseline.close
        const equivalentPrice = mainBase * (1 + pct)
        if (!Number.isFinite(equivalentPrice)) continue
        min = Math.min(min, equivalentPrice)
        max = Math.max(max, equivalentPrice)
      }
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) return null
    return { min, max }
  }

  // ── Index helpers ──

  getLogicalSlotCount(): number {
    const buf = this.getActiveDataBuffer()
    const dataLength = buf ? buf.getRawData().length : 0
    return dataLength + 24
  }

  getTimestampAtLogicalIndex(index: number): number | null {
    const buf = this.getActiveDataBuffer()
    const data = buf ? buf.getRawData() : []
    if (!Number.isInteger(index) || index < 0 || index >= data.length) return null
    return data[index]?.timestamp ?? null
  }

  getLogicalIndexAtX(mouseX: number): number | null {
    if (this.deps.viewport.readonly.viewWidth.peek() === 0) return null
    const vp = this.deps.viewport.readonly.viewport.peek()
    const buf = this.getActiveDataBuffer()
    const data = buf ? buf.getRawData() : []
    if (data.length === 0) return null
    const dpr = this.deps.viewport.readonly.dpr.peek()
    const opt = this.deps.getOption()
    const { startXPx, unitPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)
    const worldX = Math.round((vp.scrollLeft + mouseX) * dpr)
    const index = Math.floor((worldX - startXPx) / unitPx)
    if (index < 0) return null
    return index
  }

  getDataIndexAtX(mouseX: number): number | null {
    const index = this.getLogicalIndexAtX(mouseX)
    const buf = this.getActiveDataBuffer()
    const dataLength = buf ? buf.getRawData().length : 0
    if (index === null || index >= dataLength) return null
    return index
  }

  private disposeAllBuffers(): void {
    for (const key of this._klineBuffers.keys()) {
      this.disposeBuffer(key)
    }
    for (const key of this._tsBuffers.keys()) {
      this.disposeBuffer(key)
    }
  }

  destroy(): void {
    this._comparisonSpecsUnsub?.()
    this._comparisonSpecsUnsub = null
    this._comparisonManager.clearAll()
    this.unbindActiveBuffer()
    this.disposeAllBuffers()
    this._loadHint.destroy()
  }
}

function findComparisonBaselineByDate(
  data: ReadonlyArray<KLineData>,
  date: string,
): KLineData | null {
  for (const item of data) {
    if (item.date && item.date >= date) return item
  }
  return null
}

function findComparisonBaselineByTimestamp(
  data: ReadonlyArray<KLineData>,
  timestamp: number,
): KLineData | null {
  for (const item of data) {
    if (item.timestamp >= timestamp) return item
  }
  return null
}
