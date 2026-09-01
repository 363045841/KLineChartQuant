import {
  FIVE_DAY_TIME_SHARE_DAYS,
  FIVE_DAY_TIME_SHARE_PERIOD,
  isTimeSharePeriod,
  type SymbolSpec,
  type SymbolInfo,
  type CustomDataSource,
} from '../../controllers/types'
import { DataBuffer } from '../../data/buffer/dataBuffer'
import { DEFAULT_BAR_PAGE_LIMIT } from '../../data/buffer/marketDataPolicy'
import { MarketDataCache } from '../../data/buffer/marketDataCache'
import type {
  KLineBuffer,
  TimeShareBuffer,
  DataChange,
} from '../../data/buffer/dataBufferTypes'
import { marketDataProviderRegistry } from '../../data/provider/registry'
import type {
  InstrumentDescriptor,
  KLineAdjustment,
  KLinePeriod,
  TradingDate,
} from '../../data/provider/types'
import { DEFAULT_KLINE_ADJUSTMENT, DEFAULT_KLINE_PERIOD } from '../../data/provider/types'
import { TimeShareBuffer as TimeShareBufferImpl } from '../../data/buffer/timeShareBuffer'
import {
  AUTO_SOURCE_ID,
  LATEST_TRADING_DATE,
  SeriesRepository,
  instrumentKeyFromSpec,
  seriesSelectionKey,
  sourceIdFromSpec,
  type SeriesSelection,
  type TradingDateKey,
} from '../../data/buffer/seriesRepository'
import { MarketSessionRegistry } from '../market/marketSessionRegistry'
import type { ReadonlySignal } from '../../foundation/reactivity/signal'
import type { KLineData, TimeShareData } from '../../foundation/types/price'
import type { ChartDom } from '../chartTypes'
import type { VisibleRange, UpdateLevel } from '../layout/pane'
import { getPhysicalKLineConfig } from '../utils/klineConfig'
import type { DataStateModule } from '../state/dataState'
import type { DataManagerStateModule, ViewportSnapshot } from '../state/dataManagerState'
import type { ViewportStateModule } from '../state/viewportState'
import type { ComparisonStateModule } from '../state/comparisonState'
import { ChartDataViewId } from '../state/modeState'

import { ComparisonManager } from './comparisonManager'
import { IncrementalLoadHint } from './incrementalLoadHint'
import { ScrollCompensator } from './scrollCompensator'
import { symbolSpecIdentityKey } from './symbolIdentity'

export interface DataDependencies {
  getOption: () => { kWidth: number; kGap: number }
  getZoomLevel: () => number
  setZoomLevel: (level: number) => void
  getDom: () => ChartDom
  /** scroll / dpr / 可见区间 / 几何 SSOT */
  viewport: ViewportStateModule
  /** 对比叠加状态 SSOT */
  comparison: ComparisonStateModule
  scheduleDraw: (level?: UpdateLevel) => void
  resetInteraction: () => void
  getIndicatorScheduler: () => {
    update: (data: KLineData[], range: VisibleRange, dataRevision?: number) => boolean
    busySignal: ReadonlySignal<boolean>
  }
  isPointerDown: () => boolean
  onTimeShareDataReady: (dataLength: number) => void
  onDataProcessed?: (data: KLineData[], range: VisibleRange) => void
  /** 写 symbols 选择（含 primary + comparison） */
  setSymbols: (symbols: ReadonlyArray<SymbolSpec>) => void
}

const PROVIDER_MARKET_SESSIONS = new MarketSessionRegistry()
const CUSTOM_SOURCE_PREFIX = 'chart-custom:'

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

type BarsSelection = Extract<SeriesSelection, { kind: 'bars' }>
type TimeShareSelection = Extract<SeriesSelection, { kind: 'timeShare' }>

export class ChartDataManager {
  static readonly TRAILING_SLOTS = 30

  private readonly _repository = new SeriesRepository()
  /** 图表与 Agent 共用的实例级行情缓存，负责分页、重试和 Provider 请求。 */
  readonly marketDataCache = new MarketDataCache(marketDataProviderRegistry)
  private get _activeSelection(): SeriesSelection | null {
    return this._dataState.readonly.activeSelection.peek()
  }

  private _dataState: DataStateModule
  private _dmState: DataManagerStateModule
  private _dataUnsub: (() => void) | null = null
  private _loadingUnsub: (() => void) | null = null
  private _errorUnsub: (() => void) | null = null
  private _lastDataChange: DataChange<KLineData> | DataChange<TimeShareData> | null = null

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
    this._comparisonManager = new ComparisonManager(this._repository, {
      selectionForSpec: (spec) => this.barsSelectionForSpec(spec),
      createBuffer: (_spec, selection) => this.createKLineBuffer(selection),
      loadBuffer: (spec, selection, buffer) => this.loadBufferSnapshot(spec, selection, buffer),
loadRange: (spec, selection, buffer, before) =>
        this.loadBars(selection, buffer, spec, { limit: DEFAULT_BAR_PAGE_LIMIT, before }),
      releaseSelection: (selection) => this.releaseComparisonSelection(selection),
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

  private lookupBuffer(selection: SeriesSelection): KLineBuffer | TimeShareBuffer | undefined {
    return this._repository.get(selection)
  }

  /** 将业务品种转换为 Repository K 线选择。 */
  private barsSelectionForSpec(spec: SymbolSpec): BarsSelection {
    const period = ChartDataManager.normalizePeriod(spec.period)
    const adjustment = spec.adjust ?? DEFAULT_KLINE_ADJUSTMENT
    if (!KLINE_PERIODS.has(period as KLinePeriod)) {
      throw new Error(`[ChartDataManager] invalid K-line period "${period}"`)
    }
    if (!KLINE_ADJUSTMENTS.has(adjustment as KLineAdjustment)) {
      throw new Error(`[ChartDataManager] invalid K-line adjustment "${adjustment}"`)
    }
    return {
      kind: 'bars',
      instrumentKey: instrumentKeyFromSpec(spec),
      sourceId: sourceIdFromSpec(spec),
      period: period as KLinePeriod,
      adjustment: adjustment as KLineAdjustment,
    }
  }

  /** 将业务品种转换为 Repository 分时选择。 */
  private timeShareSelectionForSpec(
    spec: SymbolSpec,
    tradingDate: TradingDateKey = LATEST_TRADING_DATE,
  ): TimeShareSelection {
    return {
      kind: 'timeShare',
      instrumentKey: instrumentKeyFromSpec(spec),
      sourceId: sourceIdFromSpec(spec),
      tradingDate,
    }
  }

  /** 激活一个 Repository 叶子 Buffer。 */
  private activateBuffer(selection: SeriesSelection): void {
    if (
      this._activeSelection &&
      seriesSelectionKey(this._activeSelection) === seriesSelectionKey(selection)
    ) {
      return
    }
    this.resetIncrementalLoadHintBatch()
    this.bindActiveBuffer(selection)
  }

  /** 订阅当前 active buffer 的 data/loading，路径为 subscription → Action */
  private bindActiveBuffer(selection: SeriesSelection): void {
    this.unbindActiveBuffer()
    const buf = this.lookupBuffer(selection)
    if (!buf) {
      this.publishEmptySnapshot()
      return
    }

    this._dataUnsub = buf.data.subscribe(() => {
      this.handleBufferDataEvent(selection)
    })
    this._loadingUnsub = buf.loading.subscribe(() => {
      this.handleBufferLoadingEvent(selection)
    })
    this._errorUnsub = buf.lastError.subscribe(() => {
      if (!this.isActiveSelection(selection)) return
      this.publishBufferSnapshot(selection, buf, false)
    })

    // 初始同步：key/data/loading 同批；subscribe 不回放当前值
    const { dataChanged, prependedCount, prevDataLength } = this.publishBufferSnapshot(
      selection,
      buf,
      true,
    )
    if (dataChanged) {
      this.onBufferDataChanged(selection, prevDataLength, prependedCount)
    }
    if (!buf.loading.peek()) {
      this.scheduleIncrementalLoadHintFlush(selection)
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

  /** 发布无活动序列快照。 */
  private publishEmptySnapshot(): void {
    this._dataState.actions.applyActiveBufferSnapshot({
      kind: 'empty',
      selection: null,
      data: [],
      loading: false,
      error: null,
      timeShareRange: null,
      timeSharePreClose: null,
    })
  }

  /** 判断给定选择是否仍是当前活动选择。 */
  private isActiveSelection(selection: SeriesSelection): boolean {
    const active = this._activeSelection
    return active !== null && seriesSelectionKey(active) === seriesSelectionKey(selection)
  }

  /** 将叶子 Buffer 的完整业务状态发布到 Kernel。 */
  private publishBufferSnapshot(
    selection: SeriesSelection,
    buf: KLineBuffer | TimeShareBuffer,
    forceData: boolean,
  ): { dataChanged: boolean; prependedCount: number; prevDataLength: number } {
    const dataChange = buf.data.peek()
    const dataChanged = forceData || dataChange !== this._lastDataChange
    const prevDataLength = this._dataState.readonly.dataLength.peek()
    const prependedCount = dataChanged ? dataChange.prependedCount : 0
    if (dataChanged) this._lastDataChange = dataChange

    if (selection.kind === 'bars') {
      const buffer = buf as KLineBuffer
      this._dataState.actions.applyActiveBufferSnapshot({
        kind: 'bars',
        selection,
        data: dataChanged
          ? [...buffer.data.peek().data]
          : (this._dataState.readonly.data.peek() as ReadonlyArray<KLineData>),
        loading: buffer.loading.peek(),
        error: buffer.lastError.peek(),
        timeShareRange: null,
        timeSharePreClose: null,
      })
    } else {
      const buffer = buf as TimeShareBuffer
      this._dataState.actions.applyActiveBufferSnapshot({
        kind: 'timeShare',
        selection,
        data: dataChanged
          ? [...buffer.data.peek().data]
          : (this._dataState.readonly.data.peek() as ReadonlyArray<TimeShareData>),
        loading: buffer.loading.peek(),
        error: buffer.lastError.peek(),
        timeShareRange: buffer.range.peek(),
        timeSharePreClose: buffer.getPreClose(),
      })
    }

    return { dataChanged, prependedCount, prevDataLength }
  }

  private handleBufferDataEvent(selection: SeriesSelection): void {
    if (!this.isActiveSelection(selection)) return
    const buf = this.lookupBuffer(selection)
    if (!buf) return
    const { dataChanged, prependedCount, prevDataLength } = this.publishBufferSnapshot(
      selection,
      buf,
      false,
    )
    if (!dataChanged) return
    this.onBufferDataChanged(selection, prevDataLength, prependedCount)
  }

  private handleBufferLoadingEvent(selection: SeriesSelection): void {
    if (!this.isActiveSelection(selection)) return
    const buf = this.lookupBuffer(selection)
    if (!buf) return
    this.publishBufferSnapshot(selection, buf, false)
    if (!buf.loading.peek()) this.scheduleIncrementalLoadHintFlush(selection)
  }

  private getActiveDataBuffer(): KLineBuffer | null {
    const selection = this._activeSelection
    return selection?.kind === 'bars' ? (this._repository.getBars(selection) ?? null) : null
  }

  private getActiveTimeShareBuffer(): TimeShareBuffer | null {
    const selection = this._activeSelection
    return selection?.kind === 'timeShare'
      ? (this._repository.getTimeShare(selection) ?? null)
      : null
  }

  private getPrimaryDataBuffer(spec: SymbolSpec): KLineBuffer {
    const selection = this.barsSelectionForSpec(spec)
    return this._repository.getOrCreateBars(selection, () => this.createKLineBuffer(selection))
  }

  /** 创建仅接收缓存查询结果的 K 线图表快照。 */
  private createKLineBuffer(selection?: BarsSelection): KLineBuffer {
    void selection
    return new DataBuffer()
  }

  /** 从共享缓存获取 K 线并写入当前图表快照。 */
  private async loadBars(
    selection: BarsSelection,
    buffer: KLineBuffer,
    spec: SymbolSpec,
target: { limit: number; before?: number },
  ): Promise<void> {
    const period = spec.period ?? DEFAULT_KLINE_PERIOD
    const adjustment = spec.adjust ?? DEFAULT_KLINE_ADJUSTMENT
    if (
      !KLINE_PERIODS.has(period as KLinePeriod) ||
      !KLINE_ADJUSTMENTS.has(adjustment as KLineAdjustment)
    ) {
      throw new Error(`[MarketDataCache] invalid bars request for "${spec.symbol}"`)
    }
    buffer.setLoading(true)
    try {
      const result = await this.marketDataCache.queryBars({
        sourceId: spec.source,
        instrument: spec.instrument,
        symbol: spec.symbol,
        exchange: spec.exchange,
        assetClass: spec.instrument?.assetClass,
        period: period as KLinePeriod,
        adjustment: adjustment as KLineAdjustment,
        limit: target.limit,
        ...(target.before === undefined ? {} : { before: target.before }),
      })
      if (!this.isActiveSelection(selection) && this._repository.getBars(selection) !== buffer) return
      if (selection.sourceId === AUTO_SOURCE_ID) {
        if (!this.handleResolvedSource(selection, result.sourceId, result.instrument, buffer)) return
      }
      buffer.mergeData(result.series.data, result.series.olderData)
    } catch (error) {
      buffer.setError(error instanceof Error ? error.message : String(error))
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

  /** 从共享缓存获取单日分时并写入当前图表快照。 */
  private async loadTimeShare(
    selection: TimeShareSelection,
    buffer: TimeShareBuffer,
    spec: SymbolSpec,
  ): Promise<void> {
    buffer.setLoading(true)
    try {
      const queryDate = buffer.getQueryDate()
      const tradingDate = queryDate ? this.tradingDateKey(queryDate) : undefined
      const result = await this.marketDataCache.queryTimeShare({
        sourceId: spec.source,
        instrument: spec.instrument,
        symbol: spec.symbol,
        exchange: spec.exchange,
        assetClass: spec.instrument?.assetClass,
        ...(tradingDate
          ? { tradingDate }
          : { resolveTradingDate: (instrument) => this.resolveTradingDate(instrument) }),
      })
      if (selection.sourceId === AUTO_SOURCE_ID) {
        if (!this.handleResolvedSource(selection, result.sourceId, result.instrument, buffer)) return
      }
      buffer.setInlineData(result.series.data, result.series.preClose)
    } catch (error) {
      buffer.setError(error instanceof Error ? error.message : String(error))
    }
  }

  /** 从共享缓存获取多日分时并写入当前图表快照。 */
  private async loadTimeShareRange(
    selection: TimeShareSelection,
    buffer: TimeShareBuffer,
    spec: SymbolSpec,
    days: number,
  ): Promise<void> {
    buffer.setLoading(true)
    try {
      const queryDate = buffer.getQueryDate()
      const endTradingDate = queryDate ? this.tradingDateKey(queryDate) : undefined
      const result = await this.marketDataCache.queryTimeShareRange({
        sourceId: spec.source,
        instrument: spec.instrument,
        symbol: spec.symbol,
        exchange: spec.exchange,
        assetClass: spec.instrument?.assetClass,
        ...(endTradingDate
          ? { endTradingDate }
          : { resolveEndTradingDate: (instrument) => this.resolveTradingDate(instrument) }),
        days,
      })
      if (selection.sourceId === AUTO_SOURCE_ID) {
        if (!this.handleResolvedSource(selection, result.sourceId, result.instrument, buffer)) return
      }
      buffer.setRange(result.range)
    } catch (error) {
      buffer.setError(error instanceof Error ? error.message : String(error))
    }
  }

  /** 将 auto Buffer 迁移到实际 Provider，并同步 Kernel 中的业务选择。 */
  private handleResolvedSource(
    selection: SeriesSelection,
    sourceId: string,
    instrument: InstrumentDescriptor,
    resolvingBuffer: KLineBuffer | TimeShareBuffer,
  ): boolean {
    if (selection.sourceId !== AUTO_SOURCE_ID) return true
    const resolved = this._repository.moveToSource(selection, sourceId)
    const symbols = this._dataState.readonly.symbols
      .peek()
      .map((spec) =>
        sourceIdFromSpec(spec) === AUTO_SOURCE_ID &&
        (selection.kind === 'bars'
          ? !isTimeSharePeriod(spec.period) &&
            seriesSelectionKey(this.barsSelectionForSpec(spec)) === seriesSelectionKey(selection)
          : isTimeSharePeriod(spec.period) &&
            instrumentKeyFromSpec(spec) === selection.instrumentKey)
          ? { ...spec, source: sourceId, instrument }
          : spec,
      )
    this.deps.setSymbols(symbols)
    const current = this._dmState.readonly.currentSpec.peek()
    if (
      current &&
      sourceIdFromSpec(current) === AUTO_SOURCE_ID &&
      (selection.kind === 'bars'
        ? !isTimeSharePeriod(current.period) &&
          seriesSelectionKey(this.barsSelectionForSpec(current)) === seriesSelectionKey(selection)
        : isTimeSharePeriod(current.period) &&
          instrumentKeyFromSpec(current) === selection.instrumentKey)
    ) {
      this._dmState.actions.setCurrentSpec({ ...current, source: sourceId, instrument })
    }
    if (this.isActiveSelection(selection)) this.bindActiveBuffer(resolved.selection)
    this.reconcileComparisonBuffers()
    return resolved.buffer === resolvingBuffer
  }

  // ── Buffer data change handler ──

  private onBufferDataChanged(
    selection: SeriesSelection,
    prevDataLength?: number,
    prependedCount?: number,
  ): void {
    if (selection.kind === 'timeShare') {
      this.onTimeShareBufferChanged()
      return
    }
    const buf = this._repository.getBars(selection)
    if (!buf) return
    this.onKLineBufferChanged(buf, prevDataLength, prependedCount ?? 0)
  }

  private onKLineBufferChanged(
    buf: KLineBuffer,
    prevDataLength?: number,
    prependedCount: number = 0,
  ): void {
    const bufferData = buf.getRawData()

    if (prependedCount > 0) {
      this._scrollCompensator.compensatePrepend(prependedCount)
    } else {
      this._scrollCompensator.adjustScrollAfterDataChange(bufferData.length)
    }

    const isInitialData =
      (prevDataLength ?? this._dataState.readonly.dataLength.peek()) === 0 && bufferData.length > 0
    if (isInitialData && !this.tryRestoreScrollFromSnapshot()) {
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
      const indicatorsReady = scheduler.update(
        bufferData,
        currentRange,
        this._dataState.readonly.dataRevision.peek(),
      )
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

  private scheduleIncrementalLoadHintFlush(selection: SeriesSelection): void {
    if (
      this._dmState.readonly.pendingIncrementalLoad.peek().count <= 0 ||
      this._pendingIncrementalLoadFlushTimer !== 0
    ) {
      return
    }

    this._pendingIncrementalLoadFlushTimer = window.setTimeout(() => {
      this._pendingIncrementalLoadFlushTimer = 0
      if (!this.isActiveSelection(selection)) return
      const buf = this.lookupBuffer(selection)
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
    // 分时模式不经过 indicator scheduler，数据就绪后必须直接请求首帧绘制。
    this.deps.scheduleDraw()
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
    return this._dataState.readonly.error
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
    return this._dmState.readonly.currentPeriod.peek()
  }

  /** Internal KLine data for indicator scheduler (empty in timeshare mode) */
  getInternalData(): KLineData[] {
    const buf = this.getActiveDataBuffer()
    if (buf) return buf.getRawData()
    const peek = this._dataState.readonly.data.peek()
    return peek.length > 0 ? (peek as KLineData[]) : []
  }

  getRenderData(): ReadonlyArray<KLineData | TimeShareData> {
    return this._dataState.readonly.data.peek()
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

  /** 返回当前多日分时的原子分组快照。 */
  getTimeShareRange(): import('../../data/provider/types').TimeShareRange | null {
    return this._dataState.readonly.timeShareRange.peek()
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
    const spec: SymbolSpec = {
      market: 'custom',
      symbol: '',
      period: DEFAULT_KLINE_PERIOD,
      adjust: DEFAULT_KLINE_ADJUSTMENT,
      source: 'custom',
      incremental: false,
    }
    const selection = this.barsSelectionForSpec(spec)
    const fallback = this._repository.getOrCreateBars(selection, () =>
      this.createKLineBuffer(selection),
    )
    fallback.setCurrentSpec(spec)
    this.activateBuffer(selection)
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
    if (isTimeSharePeriod(this.currentPeriod)) return
    const buf = this.getActiveDataBuffer()
    if (buf) {
      buf.setInlineData(data)
    }
  }

  setData(data: KLineData[]): void {
    this.dataBuffer.setInlineData(data)
  }

  appendData(newData: KLineData[]): void {
    const buf = this.getActiveDataBuffer()
    if (buf) {
      const merged = [...buf.getRawData(), ...newData]
      buf.setInlineData(merged)
    } else {
      this.dataBuffer.setInlineData(newData)
    }
  }

  getData(): KLineData[] {
    const buf = this.getActiveDataBuffer()
    return buf ? buf.getRawData() : []
  }

checkVisibleRangeGap(): void {
    const buf = this.getActiveDataBuffer()
    if (!buf) return
    const data = buf.getRawData()
    if (data.length === 0) return
    const loadedTimeRange = buf.loadedTimeRange
    if (!loadedTimeRange) return
    // 左缘扩窗检测必须用 raw（start 可为 -1）；数据下标用 clamped
    const rawRange = this.getRawVisibleRangeOrNull()
    const range = this.getVisibleRangeOrNull()
    if (!rawRange || !range) return

    let firstVisibleTs: number | undefined
    const needsOlder =
      rawRange.start < 0 ||
      (range.start < data.length && (data[range.start]?.timestamp ?? 0) < loadedTimeRange.earliestTs)

    if (needsOlder && !buf.loading.peek()) {
      const spec = buf.currentSpec
      const selection = this._activeSelection
      if (spec && selection?.kind === 'bars') {
        void this.loadBars(selection, buf, spec, {
          limit: DEFAULT_BAR_PAGE_LIMIT,
          before: loadedTimeRange.earliestTs,
        })
      }
      firstVisibleTs = rawRange.start < 0 ? (data[0]?.timestamp ?? undefined) : data[range.start]?.timestamp
    }

    if (firstVisibleTs === undefined) return

    this._comparisonManager.ensureRange(firstVisibleTs)
  }

  /** 请求当前图表缓存覆盖指定左边界；每次向前拉取一页，不按时间范围外推。 */
  ensureDataRange(startTs: number): void {
    const buffer = this.getActiveDataBuffer()
    const selection = this._activeSelection
    const spec = buffer?.currentSpec
    const loaded = buffer?.loadedTimeRange
    if (
      !buffer ||
      !selection ||
      selection.kind !== 'bars' ||
      !spec ||
      !loaded ||
      buffer.loading.peek() ||
      startTs >= loaded.earliestTs
    ) {
      return
    }
    void this.loadBars(selection, buffer, spec, {
      limit: DEFAULT_BAR_PAGE_LIMIT,
      before: loaded.earliestTs,
    })
  }

  // ── Comparison management ──

  private reconcileComparisonBuffers(): void {
    this._comparisonManager.reconcile()
  }

  /** 删除不再被 comparison 或当前主品种引用的 Repository 叶子。 */
  private releaseComparisonSelection(selection: BarsSelection): void {
    if (this.isActiveSelection(selection)) return
    const primary = this._dataState.readonly.symbols.peek()[0]
    if (
      primary &&
      selection.kind === 'bars' &&
      !isTimeSharePeriod(primary.period) &&
      seriesSelectionKey(this.barsSelectionForSpec(primary)) === seriesSelectionKey(selection)
    ) {
      return
    }
    this._repository.delete(selection)
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
        { symbol, market: primary.market, period: DEFAULT_KLINE_PERIOD },
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

  /** 为当前 K 线视图保存可恢复的横向锚点。 */
  private saveActiveKLineViewportSnapshot(): void {
    const kBuf = this.getActiveDataBuffer()
    const rawFromBuf = kBuf?.getRawData() as KLineData[] | undefined
    const kRaw = rawFromBuf ?? (this._dataState.readonly.data.peek() as KLineData[])
    const dataLen = kRaw?.length ?? 0
    let visibleStart = 0
    if (dataLen > 0) {
      const vRange = this.getVisibleRangeOrNull()
      visibleStart = vRange ? Math.max(0, vRange.start) : 0
    }
    const spec = kBuf?.currentSpec
    const anchor = kRaw?.[visibleStart]
    if (!spec || !anchor) return
    const dpr = this.deps.viewport.readonly.dpr.peek()
    const opt = this.deps.getOption()
    const { unitPx, startXPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)
    const leftBuffer = this.getLeftLoadBufferWidth()
    const baseScrollLeft = ((visibleStart + 1) * unitPx + startXPx) / dpr + leftBuffer
    const snapshot: ViewportSnapshot = {
      anchorTimestamp: anchor.timestamp,
      anchorOffsetPx: this.deps.viewport.readonly.scrollLeft.peek() - baseScrollLeft,
      zoomLevel: this.deps.getZoomLevel(),
    }
    this._dmState.actions.saveViewportSnapshot(this.getViewportSnapshotKey(spec), snapshot)
  }

  /** 生成与品种来源、周期、复权和视图绑定的快照键。 */
  private getViewportSnapshotKey(spec: SymbolSpec): string {
    return `${symbolSpecIdentityKey(spec)}:${spec.period ?? DEFAULT_KLINE_PERIOD}:${spec.adjust ?? DEFAULT_KLINE_ADJUSTMENT}:${ChartDataViewId.KLine}`
  }

  setTimeShareQueryDate(date: number): void {
    const spec = this._dmState.readonly.currentSpec.peek()
    if (!spec) return
    this.saveActiveKLineViewportSnapshot()
    const tradingDate = this.tradingDateKey(date)
    const selection = this.timeShareSelectionForSpec(spec, tradingDate)
    const buffer = this._repository.getOrCreateTimeShare(selection, () =>
      this.createTimeShareBuffer(selection),
    )
    buffer.setQueryDate(date)
    this.activateBuffer(selection)
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
    if (!period) return DEFAULT_KLINE_PERIOD
    const alias = period.toLowerCase().trim()
    if (alias === 'day') return DEFAULT_KLINE_PERIOD
    return period
  }

  /** 将 YYYYMMDD 查询参数转换为 Repository 交易日键。 */
  private tradingDateKey(date: number): TradingDate {
    const raw = String(date)
    if (!/^\d{8}$/.test(raw)) throw new Error(`[ChartDataManager] invalid trading date "${date}"`)
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` as TradingDate
  }

  /** 创建已接入统一 Provider 请求的分时 Buffer。 */
  private createTimeShareBuffer(selection: TimeShareSelection): TimeShareBuffer {
    void selection
    return new TimeShareBufferImpl()
  }

  applyCustomData(source: CustomDataSource): void {
    const sourceId = `${CUSTOM_SOURCE_PREFIX}${source.source?.trim() || 'default'}`
    const spec: SymbolSpec = {
      symbol: source.symbol ?? '',
      market: source.market,
      exchange: source.exchange,
      period: ChartDataManager.normalizePeriod(source.period),
      adjust: source.adjust ?? DEFAULT_KLINE_ADJUSTMENT,
      incremental: false,
      source: sourceId,
    }
    const comparisonSpecs = Object.keys(source.comparisons ?? {}).map<SymbolSpec>((symbol) => ({
      symbol,
      market: source.market,
      exchange: source.exchange,
      period: spec.period,
      adjust: spec.adjust,
      incremental: false,
      source: sourceId,
    }))

    const mainBuffer = this._repository.getOrCreateBars(this.barsSelectionForSpec(spec), () =>
      this.createKLineBuffer(this.barsSelectionForSpec(spec)),
    )
    mainBuffer.setCurrentSpec(spec)
    mainBuffer.setInlineData(source.data.map((item) => ({ ...item })))

    for (const comparisonSpec of comparisonSpecs) {
      const buffer = this._repository.getOrCreateBars(
        this.barsSelectionForSpec(comparisonSpec),
        () => this.createKLineBuffer(this.barsSelectionForSpec(comparisonSpec)),
      )
      buffer.setCurrentSpec(comparisonSpec)
      buffer.setInlineData(source.comparisons![comparisonSpec.symbol]!.map((item) => ({ ...item })))
    }

    this.setSymbols([spec, ...comparisonSpecs])

    const symbolCode = spec.symbol
    if (symbolCode) {
      this.registerSymbols([
        {
          symbol: symbolCode,
          market: source.market,
          description: source.description ?? symbolCode,
          exchange: source.exchange ?? '',
          source: sourceId,
        },
      ])
    }
  }

  resetToFetcher(spec: SymbolSpec): void {
    this._dmState.actions.setRangeInitialized(false)
    this.setSymbols([spec, ...this.deps.comparison.readonly.specs.peek()])
  }

  // ── Main symbol switching ──

  setSymbols(specs: ReadonlyArray<SymbolSpec>): void {
    const selection = isTimeSharePeriod(specs[0]?.period) ? specs.slice(0, 1) : specs
    this.deps.setSymbols(selection)

    if (selection.length === 0) {
      this._dmState.actions.setCurrentSpec(null)
      this._repository.clear()
      this.publishEmptySnapshot()
      this._dmState.actions.setRangeInitialized(false)
      return
    }

    const primary = selection[0]!
    this._dmState.actions.setCurrentSpec(primary)

    if (isTimeSharePeriod(primary.period)) {
      // Switch to timeshare mode
      // 激活分时 buffer 前保存当前 K 线视图锚点。
      this.saveActiveKLineViewportSnapshot()
      // Keep primary KLine buffer in memory — don't dispose it,
      // so data and scroll position are preserved when user returns
      this._dmState.actions.setRangeInitialized(false)

      const active = this._activeSelection
      const latestSelection = this.timeShareSelectionForSpec(primary)
      const tsSelection =
        active?.kind === 'timeShare' &&
        active.instrumentKey === latestSelection.instrumentKey &&
        active.sourceId === latestSelection.sourceId
          ? active
          : latestSelection
      const tsBuf = this._repository.getOrCreateTimeShare(tsSelection, () =>
        this.createTimeShareBuffer(tsSelection),
      )
      this.activateBuffer(tsSelection)
      if (primary.period === FIVE_DAY_TIME_SHARE_PERIOD) {
        void this.loadTimeShareRange(tsSelection, tsBuf, primary, FIVE_DAY_TIME_SHARE_DAYS)
      } else {
        void this.loadTimeShare(tsSelection, tsBuf, primary)
      }
      return
    }

    this.loadKLineSymbols(selection)
  }

  // ── KLine loading ──

  private loadKLineSymbols(specs: ReadonlyArray<SymbolSpec>): void {
    const spec = specs[0]!
    const buf = this.getPrimaryDataBuffer(spec)
    this.activateBuffer(this.barsSelectionForSpec(spec))
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
      // 有快照时由 Chart 在模式切换后恢复；否则定位到最新数据。
      if (!this._dmState.actions.getViewportSnapshot(this.getViewportSnapshotKey(spec))) {
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
    void this.loadBars(this.barsSelectionForSpec(spec), buf, spec, {
      limit: DEFAULT_BAR_PAGE_LIMIT,
    })
  }

  /** 初始化一个 Repository K 线快照，并通过共享缓存填充首个窗口。 */
  private loadBufferSnapshot(spec: SymbolSpec, selection: BarsSelection, buffer: KLineBuffer): void {
    buffer.setSymbol(spec)
    void this.loadBars(selection, buffer, spec, { limit: DEFAULT_BAR_PAGE_LIMIT })
  }

  /** K 线数据可用后按其视图快照恢复横向位置。 */
  tryRestoreScrollFromSnapshot(): boolean {
    const buf = this.getActiveDataBuffer()
    if (!buf) return false
    const raw = buf.getRawData() as KLineData[]
    if (raw.length === 0) return false
    const spec = buf.currentSpec
    if (!spec) return false
    const snapshot = this._dmState.actions.consumeViewportSnapshot(
      this.getViewportSnapshotKey(spec),
    )
    if (!snapshot) return false
    const idx = raw.findIndex((d) => d.timestamp >= snapshot.anchorTimestamp)
    if (idx >= 0) {
      this.deps.setZoomLevel(snapshot.zoomLevel)
      const dpr = this.deps.viewport.readonly.dpr.peek()
      const opt = this.deps.getOption()
      const { unitPx, startXPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)
      const leftBuffer = this.getLeftLoadBufferWidth()
      const scrollLeft =
        ((idx + 1) * unitPx + startXPx) / dpr + leftBuffer + snapshot.anchorOffsetPx
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

  // ── Comparison view line range ──

  /**
   * 比较视图下可见区折线（主商品 close + 各比较商品等价价）的极值范围。
   * 用作主图 y 轴范围及缩放/平移 clamp 上下限；返回 null 表示当前不可用。
   */
  getComparisonViewLineRange(range: VisibleRange): { min: number; max: number } | null {
    const comparisonSpecs = this.deps.comparison.readonly.specs.peek()
    if (comparisonSpecs.length === 0) return null
    const buf = this.getActiveDataBuffer()
    const internalData = buf ? buf.getRawData() : []
    if (internalData.length === 0) return null
    const baseIndex = Math.max(0, range.start)
    const baseItem = internalData[baseIndex]
    if (!baseItem || !Number.isFinite(baseItem.close) || baseItem.close <= 0) return null
    const mainBase = baseItem.close
    const baseDate = baseItem.date ?? ''
    const startIdx = Math.max(0, range.start)

    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY

    // 主商品折线：close（蜡烛已隐藏，不使用 high/low）
    for (let i = startIdx; i < range.end && i < internalData.length; i++) {
      const close = internalData[i]?.close
      if (Number.isFinite(close)) {
        if (close < min) min = close
        if (close > max) max = close
      }
    }

    // 比较商品折线：相对自身基准的涨跌幅折算为主商品基准上的等价价
    for (const spec of comparisonSpecs) {
      const data = this._comparisonManager.data.get(symbolSpecIdentityKey(spec))
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

      for (let i = startIdx; i < range.end && i < internalData.length; i++) {
        const mainItem = internalData[i]
        if (!mainItem) continue
        const key = mainItem.date ?? String(mainItem.timestamp)
        const item = byDate.get(key)
        if (!item || !Number.isFinite(item.close)) continue

        const pct = (item.close - baseline.close) / baseline.close
        const equivalentPrice = mainBase * (1 + pct)
        if (!Number.isFinite(equivalentPrice)) continue
        if (equivalentPrice < min) min = equivalentPrice
        if (equivalentPrice > max) max = equivalentPrice
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

  destroy(): void {
    this._comparisonSpecsUnsub?.()
    this._comparisonSpecsUnsub = null
    this._comparisonManager.clearAll()
    this.unbindActiveBuffer()
    this._repository.dispose()
    this.marketDataCache.destroy()
    this._loadHint.destroy()
  }
}

function findComparisonBaselineByDate(
  data: ReadonlyArray<KLineData>,
  date: string,
): KLineData | null {
  return findFirstAtOrAfter(data, date, (item) => item.date ?? '')
}

/** 从时间升序序列中二分定位首个不早于目标时间戳的比较基线。 */
function findComparisonBaselineByTimestamp(
  data: ReadonlyArray<KLineData>,
  timestamp: number,
): KLineData | null {
  return findFirstAtOrAfter(data, timestamp, (item) => item.timestamp)
}

/** 在已按键升序排列的数据中定位首个不小于目标值的元素。 */
function findFirstAtOrAfter<T, TValue extends string | number>(
  data: ReadonlyArray<T>,
  target: TValue,
  valueOf: (item: T) => TValue,
): T | null {
  let low = 0
  let high = data.length
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    const item = data[middle]
    if (item && valueOf(item) < target) {
      low = middle + 1
    } else {
      high = middle
    }
  }
  return data[low] ?? null
}
