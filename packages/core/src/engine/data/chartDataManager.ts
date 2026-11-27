/**
 * 图表数据协调器：只负责视图状态与投影，取数、分页、实时合并全部交给行情服务。
 *
 * 不再持有缓存、不再订阅流、不再合并历史；序列句柄由服务提供。
 */
import type { IndicatorMarketContext } from '@363045841yyt/klinechart-plot-contracts'
import {
  FIVE_DAY_TIME_SHARE_DAYS,
  FIVE_DAY_TIME_SHARE_PERIOD,
  isTimeSharePeriod,
  type SymbolInfo,
} from '../../controllers/types.js'
import type { SymbolSpec } from '@/data/symbolSpec.js'
import { DEFAULT_BAR_PAGE_LIMIT } from '../../data/buffer/impl/marketDataPolicy.js'
import {
  type BarsSelection,
  instrumentKeyFromSpec,
  LATEST_TRADING_DATE,
  SERIES_SELECTION_KIND,
  type SeriesSelection,
  seriesSelectionKey,
  sourceFromSpec,
  type TimeShareSelection,
  type TradingDateKey,
} from '../../data/buffer/seriesSelection.js'
import {
  DATA_CHANGE_KINDS,
  type CoverageResult,
  type DataChange,
} from '../../data/buffer/types.js'
import {
  DEFAULT_KLINE_ADJUSTMENT,
  DEFAULT_KLINE_PERIOD,
  isTradingDate,
  KLinePeriod,
  OLDER_DATA_STATUS,
  ORIGINAL_BAR_AGGREGATION,
  type TradingDate,
} from '../../data/provider/types.js'
import type {
  BarsSeries,
  MarketDataService,
  TimeShareSeries,
  TradesSeries,
} from '../../data/service/index.js'
import type { TradeSnapshot } from '../../data/trades/types.js'
import { resolveBarsSelection } from '../../data/service/index.js'
import { EMPTY_TRADE_SNAPSHOT } from '../../data/trades/types.js'
import { GENERIC_ERROR_CODES, KLineChartError } from '../../errors.js'
import type { MarketSessionRegistry } from '../../foundation/config/marketSession/marketSessionRegistry.js'
import { batch, type ReadonlySignal } from '../../foundation/reactivity/signal.js'
import type { KLineData, TimeShareData } from '../../foundation/types/price.js'
import type { ChartDom } from '../chart/index.js'
import { createScriptTimeContext } from './series/scriptTimeContext.js'
import { readIndicatorBars } from '../calculation/market/impl/readIndicatorBars.js'
import type { ComparisonStateModule } from '../chartModel/index.js'
import { type ComparisonProjection, projectComparison } from '../chartModel/index.js'
import type { UpdateLevel } from '../pane/index.js'
import type { DataManagerStateModule } from '../state/dataManagerState.js'
import { ACTIVE_BUFFER_KIND, type DataStateModule } from '../state/dataState.js'
import type { ViewportStateModule } from '../state/viewportState.js'
import type { VisibleRange } from '../viewport/viewport.js'
import { hasLeftDataGap } from '../viewport/viewport.js'

import { ComparisonManager } from './comparisonManager.js'
import { IncrementalLoadHint } from './incrementalLoadHint.js'
import { ScrollCompensator } from './scrollCompensator.js'
import { symbolInfoIdentityKey } from './symbolIdentity.js'

/** 图表需要的数据与视图依赖；行情相关只保留统一服务。 */
export interface DataDependencies {
  readonly data: MarketDataService
  readonly marketSessions: MarketSessionRegistry
  updateTradeInput: (input: TradeSnapshot) => void
  needsTrades: () => boolean
  /** 视图尺寸与几何；滚动补偿和增量提示使用。 */
  getOption: () => { kWidth: number; kGap: number }
  getDom: () => ChartDom
  /** scroll / dpr / 可见区间 / 几何 SSOT */
  viewport: ViewportStateModule
  /** 对比叠加状态 SSOT */
  comparison: ComparisonStateModule
  scheduleDraw: (level?: UpdateLevel) => void
  /** 行情页确实向左推进后，由 Chart 决定是否继续补齐左缘。 */
  onBarsReady: () => void
  resetInteraction: () => void
  /** 选择共享计算序列，并提供图表独有的分时投影。 */
  projectIndicatorFeed: (
    selection: BarsSelection | null,
    displayTimestamps: readonly number[] | null,
  ) => void
  /** 发布 symbols 选择（含 primary + comparison），只写状态不触发加载 */
  publishSymbols: (symbols: ReadonlyArray<SymbolSpec>) => void
}

/** 图表数据协调器。 */
export class ChartDataManager {
  static readonly TIME_SHARE_INDICATOR_BAR_LIMIT = 1_500

  private readonly deps: DataDependencies
  private readonly _dataState: DataStateModule
  private readonly _dmState: DataManagerStateModule
  private readonly _scrollCompensator: ScrollCompensator
  private readonly _comparisonManager: ComparisonManager
  private readonly _loadHint: IncrementalLoadHint
  private readonly _comparisonSpecsUnsub: () => void

  private _activeSelection: SeriesSelection | null = null
  private _bars: BarsSeries | null = null
  private _timeShare: TimeShareSeries | null = null
  private _trades: TradesSeries | null = null
  private _tradesUnsub: (() => void) | null = null
  private _tradeTimer: ReturnType<typeof setTimeout> | null = null
  private _barsUnsub: (() => void) | null = null
  private _timeShareUnsub: (() => void) | null = null
  private _loadingUnsub: (() => void) | null = null
  private _errorUnsub: (() => void) | null = null
  private _lastDataChange: DataChange<KLineData> | DataChange<TimeShareData> | null = null
  private _dataRevision = 0
  private _coverageTarget: number | null = null
  private _coveragePromise: Promise<CoverageResult> | null = null
  private _hasActiveData = false
  private _timeShareIndicatorBars: BarsSeries | null = null
  private _pendingIncrementalLoadFlushTimer: ReturnType<typeof setTimeout> | null = null
  private _disposed = false

  constructor(deps: DataDependencies, dataState: DataStateModule, dmState: DataManagerStateModule) {
    this.deps = deps
    this._dataState = dataState
    this._dmState = dmState
    this._scrollCompensator = new ScrollCompensator(deps)
    this._loadHint = new IncrementalLoadHint(deps)
    this._comparisonManager = new ComparisonManager({
      acquire: (spec) => {
        const resolved = this.comparisonSpecForPrimary(spec)
        return this.deps.data.bars(resolved, {
          aggregation: ORIGINAL_BAR_AGGREGATION,
          initialBars: DEFAULT_BAR_PAGE_LIMIT,
        })
      },
      scheduleDraw: () => this.deps.scheduleDraw(),
      getSpecs: () => this.deps.comparison.readonly.specs.peek(),
      setLoading: (loading) => this.deps.comparison.actions.setLoading(loading),
    })
    this._comparisonSpecsUnsub = this.deps.comparison.readonly.specs.subscribe(() => {
      this._comparisonManager.reconcile()
    })
    this._comparisonManager.reconcile()
  }

  /** 图表与 Agent 共用的底层缓存；窗口查询与容量设置走这里。 */
  get marketData(): MarketDataService {
    return this.deps.data
  }

  /** 设置共享缓存上限。 */
  setCacheMaxBytes(maxBytes: number): void {
    this.deps.data.setMaxBytes(maxBytes)
  }

  // ── 序列与状态 ──

  private get _activeData(): BarsSeries | null {
    return this._activeSelection?.kind === SERIES_SELECTION_KIND.bars ? this._bars : null
  }

  private get _activeTimeShare(): TimeShareSeries | null {
    return this._activeSelection?.kind === SERIES_SELECTION_KIND.timeShare ? this._timeShare : null
  }

  private isActiveSelection(selection: SeriesSelection): boolean {
    return (
      this._activeSelection !== null &&
      seriesSelectionKey(this._activeSelection) === seriesSelectionKey(selection)
    )
  }

  /** 当前可见范围（on-demand 实时计算，消除 stale 缓存）。 */
  getCurrentVisibleRange(): VisibleRange | null {
    return this.getVisibleRangeOrNull()
  }

  get data(): ReadonlySignal<ReadonlyArray<KLineData>> {
    return this._dataState.readonly.data as ReadonlySignal<ReadonlyArray<KLineData>>
  }

  get loading(): ReadonlySignal<boolean> {
    return this._dataState.readonly.loading
  }

  get dataError(): ReadonlySignal<string | null> {
    return this._dataState.readonly.error
  }

  get symbols(): ReadonlySignal<ReadonlyArray<SymbolSpec>> {
    return this._dataState.readonly.symbols
  }

  get symbolCatalog(): ReadonlySignal<ReadonlyArray<SymbolInfo>> {
    return this._dataState.readonly.symbolCatalog
  }

  get currentPeriod(): string {
    return this._dmState.readonly.currentPeriod.peek()
  }

  /** 注册可搜索品种，按稳定 id 去重。 */
  registerSymbols(infos: ReadonlyArray<SymbolInfo>): void {
    const current = new Map(
      this._dataState.readonly.symbolCatalog
        .peek()
        .map((info) => [symbolInfoIdentityKey(info), info]),
    )
    for (const info of infos) current.set(symbolInfoIdentityKey(info), info)
    this._dataState.actions.setSymbolCatalog([...current.values()])
  }

  /** 指标调度器使用的 K 线；分时模式为空。 */
  getInternalData(): readonly KLineData[] {
    const bars = this._activeData
    if (bars) return bars.getRawData()
    const peek = this._dataState.readonly.data.peek()
    return peek.length > 0 ? (peek as readonly KLineData[]) : []
  }

  /** 当前主序列的提交版本，供绘制投影判断行情是否变化。 */
  getRenderDataRevision(): number {
    return this._dataState.readonly.dataRevision.peek()
  }

  getRenderData(): ReadonlyArray<KLineData | TimeShareData> {
    return this._dataState.readonly.data.peek()
  }

  getData(): readonly KLineData[] {
    return this._activeData?.getRawData() ?? []
  }

  get dataBuffer(): BarsSeries {
    const bars = this._activeData
    if (!bars) throw new Error('No active K-line series')
    return bars
  }

  getTimeShareData(): readonly TimeShareData[] {
    return this._activeTimeShare?.getRawData() ?? []
  }

  getTimeSharePreClose(): number | null {
    return this._activeTimeShare?.getPreClose() ?? null
  }

  getTimeShareRange(): import('../../data/provider/types.js').TimeShareRange | null {
    return this._activeTimeShare?.range.peek() ?? null
  }

  getComparisonData(): Map<string, KLineData[]> {
    return this._comparisonManager.data
  }

  getComparisonSpecs(): SymbolSpec[] {
    return this._comparisonManager.specs
  }

  getComparisonColors(): Map<string, string> {
    return new Map(this.deps.comparison.readonly.colors.peek())
  }

  getComparisonHidden(): ReadonlyMap<string, boolean> {
    return this.deps.comparison.readonly.hidden.peek()
  }

  getComparisonContentInputs(): readonly unknown[] {
    return [
      this.deps.comparison.readonly.specs.peek(),
      this.deps.comparison.readonly.colors.peek(),
      this.deps.comparison.readonly.hidden.peek(),
      ...this._comparisonManager.getContentInputs(),
    ]
  }

  /** 构建主品种 OHLC 与比较折线的可见投影。 */
  getComparisonProjection(
    range: VisibleRange,
    kLineCenters: ReadonlyArray<number>,
    scrollLeft: number,
    paneWidth: number,
  ): ComparisonProjection | null {
    if (this.getComparisonSpecs().length === 0) return null
    return projectComparison(
      this.getInternalData(),
      this._comparisonManager.data,
      range,
      kLineCenters,
      scrollLeft,
      paneWidth,
      this.deps.comparison.readonly.hidden.peek(),
    )
  }

  // ── 订阅与发布 ──

  private publishEmptySnapshot(): void {
    this._dataState.actions.applyActiveBufferSnapshot({
      kind: ACTIVE_BUFFER_KIND.empty,
      selection: null,
      data: [],
      loading: false,
      error: null,
      timezone: null,
      timeShareRange: null,
      timeSharePreClose: null,
    })
  }

  /** 发布当前序列的完整快照；返回数据是否发生变化。 */
  private publishSnapshot(forceData: boolean): boolean {
    const selection = this._activeSelection
    if (!selection) return false
    if (selection.kind === SERIES_SELECTION_KIND.bars) {
      const bars = this._bars
      if (!bars) return false
      const change = bars.data.peek()
      const dataChanged = forceData || change !== this._lastDataChange
      if (dataChanged) this._lastDataChange = change
      this._dataState.actions.applyActiveBufferSnapshot(
        {
          kind: ACTIVE_BUFFER_KIND.bars,
          selection,
          data: dataChanged
            ? change.data
            : (this._dataState.readonly.data.peek() as ReadonlyArray<KLineData>),
          loading: bars.loading.peek(),
          error: bars.lastError.peek(),
          timezone: bars.timezone,
          timeShareRange: null,
          timeSharePreClose: null,
        },
        this.readySession(selection, bars),
      )
      return dataChanged
    }
    const series = this._timeShare
    if (!series) return false
    const change = series.data.peek()
    const dataChanged = forceData || change !== this._lastDataChange
    if (dataChanged) this._lastDataChange = change
    this._dataState.actions.applyActiveBufferSnapshot({
      kind: ACTIVE_BUFFER_KIND.timeShare,
      selection,
      data: dataChanged
        ? change.data
        : (this._dataState.readonly.data.peek() as ReadonlyArray<TimeShareData>),
      loading: series.loading.peek(),
      error: series.lastError.peek(),
      timezone: series.range.peek()?.timezone ?? null,
      timeShareRange: series.range.peek(),
      timeSharePreClose: series.getPreClose(),
    })
    return dataChanged
  }

  /** 已解析来源且已有首批数据时生成就绪身份。 */
  private readySession(selection: BarsSelection, series: BarsSeries): {
    selection: BarsSelection
    instrument: SymbolSpec['instrument']
    capabilities: NonNullable<BarsSeries['capabilities']>
  } | null {
    const capabilities = series.capabilities
    if (!capabilities || series.timezone === null) return null
    return { selection, instrument: series.instrument, capabilities }
  }

  private bindActiveSeries(selection: SeriesSelection): void {
    this.unbindActiveSeries()
    this._activeSelection = selection
    if (selection.kind === SERIES_SELECTION_KIND.bars) {
      const bars = this._bars
      if (!bars) return this.publishEmptySnapshot()
      this.deps.projectIndicatorFeed(selection, null)
      this._barsUnsub = bars.data.subscribe(() => this.handleData(selection))
      this._loadingUnsub = bars.loading.subscribe(() => this.handleLoading(selection))
      this._errorUnsub = bars.lastError.subscribe(() => {
        if (this.isActiveSelection(selection)) this.publishSnapshot(false)
      })
      if (this.publishSnapshot(true)) this.onDataChanged(selection)
      if (!bars.loading.peek()) this.scheduleIncrementalLoadHintFlush(selection)
      return
    }
    const series = this._timeShare
    if (!series) return this.publishEmptySnapshot()
    this._timeShareUnsub = series.data.subscribe(() => this.handleData(selection))
    this._loadingUnsub = series.loading.subscribe(() => this.handleLoading(selection))
    this._errorUnsub = series.lastError.subscribe(() => {
      if (this.isActiveSelection(selection)) this.publishSnapshot(false)
    })
    if (this.publishSnapshot(true)) this.onDataChanged(selection)
    if (!series.loading.peek()) this.scheduleIncrementalLoadHintFlush(selection)
  }

  private unbindActiveSeries(): void {
    this._barsUnsub?.()
    this._timeShareUnsub?.()
    this._loadingUnsub?.()
    this._errorUnsub?.()
    this._barsUnsub = null
    this._timeShareUnsub = null
    this._loadingUnsub = null
    this._errorUnsub = null
    this._lastDataChange = null
  }

  private handleData(selection: SeriesSelection): void {
    if (!this.isActiveSelection(selection)) return
    if (!this.publishSnapshot(false)) return
    this._dataRevision++
    this.onDataChanged(selection)
  }

  private handleLoading(selection: SeriesSelection): void {
    if (!this.isActiveSelection(selection)) return
    this.publishSnapshot(false)
    const active = this._activeData ?? this._activeTimeShare
    if (active && !active.loading.peek()) this.scheduleIncrementalLoadHintFlush(selection)
  }

  private onDataChanged(selection: SeriesSelection): void {
    if (selection.kind === SERIES_SELECTION_KIND.timeShare) {
      this.onTimeShareChanged()
      return
    }
    const bars = this._bars
    if (!bars) return
    const change = bars.data.peek()
    const data = bars.getRawData()
    const prepended =
      change.kind === DATA_CHANGE_KINDS.prepend
        ? change.end - change.start
        : (change.prependedCount ?? 0)
    if (prepended > 0) this._scrollCompensator.compensatePrepend(prepended)
    const firstData = !this._hasActiveData
    this._hasActiveData = true
    if (!firstData && (change.kind === DATA_CHANGE_KINDS.replace || prepended > 0)) {
      this.deps.resetInteraction()
    }
    if (!this._dmState.readonly.rangeInitialized.peek() && data.length > 0) {
      this._dmState.actions.setRangeInitialized(true)
    }
    if (prepended > 0) {
      this._dmState.actions.recordIncrementalLoad(
        prepended,
        this.deps.viewport.readonly.leftLoadBufferWidth.peek(),
      )
    }
    this.deps.onBarsReady()
    if (this.deps.needsTrades()) this.reconcileTradeInput()
  }

  private onTimeShareChanged(): void {
    this._dmState.actions.setRangeInitialized(true)
    this.deps.resetInteraction()
    const spec = this._dmState.readonly.currentSpec.peek()
    const data = this._activeTimeShare?.getRawData()
    if (spec && data?.length) {
      const barsSpec = { ...this.normalizeSpec(spec), period: KLinePeriod.Min1 }
      this._timeShareIndicatorBars ??= this.deps.data.bars(barsSpec, {
        aggregation: ORIGINAL_BAR_AGGREGATION,
        initialBars: ChartDataManager.TIME_SHARE_INDICATOR_BAR_LIMIT,
      })
      this.deps.projectIndicatorFeed(resolveBarsSelection(barsSpec, ORIGINAL_BAR_AGGREGATION), data.map((item) => item.timestamp))
    }
    this.deps.scheduleDraw()
  }

  // ── 覆盖与预取 ──

  /**
   * 让当前序列覆盖到 `fromTs`；守卫、串行与耗尽判断都在这里。
   */
  ensureCoverageFrom(fromTs: number): Promise<CoverageResult> {
    if (
      !Number.isFinite(fromTs) &&
      fromTs !== Number.POSITIVE_INFINITY &&
      fromTs !== Number.NEGATIVE_INFINITY
    ) {
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_PARAM,
        'Coverage needs a valid lower bound',
      )
    }
    if (!this._activeData) {
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_PARAM,
        'Coverage requires an active K-line series',
      )
    }
    this._coverageTarget = this._coverageTarget === null ? fromTs : Math.min(this._coverageTarget, fromTs)
    if (!this._coveragePromise) {
      this._coveragePromise = this.drainCoverage().finally(() => {
        this._coveragePromise = null
      })
    }
    return this._coveragePromise
  }

  /** 逐页推进，直到覆盖、耗尽或序列切换。 */
  private async drainCoverage(): Promise<CoverageResult> {
    for (;;) {
      const target = this._coverageTarget
      if (target === null) return 'covered'
      const series = this._activeData
      if (!series) return 'superseded'
      const loaded = series.loadedTimeRange
      if (loaded && loaded.earliestTs <= target) {
        this._coverageTarget = null
        return 'covered'
      }
      if (series.olderData === OLDER_DATA_STATUS.EXHAUSTED) {
        this._coverageTarget = null
        return 'exhausted'
      }
      const result = await series.loadOlder(DEFAULT_BAR_PAGE_LIMIT)
      if (result === 'superseded') return 'superseded'
      if (result === 'exhausted') {
        this._coverageTarget = null
        return 'exhausted'
      }
    }
  }

  /** 视口贴到左边界时预取一页。 */
  checkVisibleRangeGap(): void {
    const bars = this._activeData
    if (!bars) return
    const data = bars.getRawData()
    if (data.length === 0) return
    const range = this.getVisibleRangeOrNull()
    const rawRange = this.getRawVisibleRangeOrNull()
    const first = range && rawRange ? data[rawRange.start < 0 ? 0 : range.start] : undefined
    if (first) this._comparisonManager.ensureRange(first.timestamp)
    if (
      !hasLeftDataGap(
        this.deps.viewport.readonly.scrollLeft.peek(),
        this.deps.viewport.readonly.leftLoadBufferWidth.peek(),
      )
    ) {
      return
    }
    const loaded = bars.loadedTimeRange
    if (!loaded) return
    void this.ensureCoverageFrom(loaded.earliestTs - 1).catch(() => {})
  }

  // ── 品种切换 ──

  private static normalizePeriod(period?: string): string {
    if (!period) return DEFAULT_KLINE_PERIOD
    const alias = period.toLowerCase().trim()
    if (alias === 'day') return DEFAULT_KLINE_PERIOD
    return period
  }

  private barsSelectionForSpec(spec: SymbolSpec): BarsSelection {
    return resolveBarsSelection(this.normalizeSpec(spec), ORIGINAL_BAR_AGGREGATION)
  }

  private comparisonSpecForPrimary(spec: SymbolSpec): SymbolSpec {
    const primary = this._dataState.readonly.symbols.peek()[0]
    if (!primary) return this.normalizeSpec(spec)
    const primaryPeriod = primary.period
    const period =
      primaryPeriod === undefined || isTimeSharePeriod(primaryPeriod) ? spec.period : primaryPeriod
    return this.normalizeSpec({
      ...spec,
      ...(period === undefined ? {} : { period }),
      ...(primary.adjust === undefined ? {} : { adjust: primary.adjust }),
    })
  }

  /** 图表边界补齐周期与复权默认值；行情服务本身不接受缺省。 */
  private normalizeSpec(spec: SymbolSpec): SymbolSpec {
    return {
      ...spec,
      period: ChartDataManager.normalizePeriod(spec.period),
      adjust: spec.adjust ?? DEFAULT_KLINE_ADJUSTMENT,
    }
  }

  private timeShareSelectionForSpec(
    spec: SymbolSpec,
    tradingDate: TradingDateKey = LATEST_TRADING_DATE,
  ): TimeShareSelection {
    return {
      kind: SERIES_SELECTION_KIND.timeShare,
      instrumentKey: instrumentKeyFromSpec(spec),
      source: sourceFromSpec(spec),
      tradingDate,
    }
  }

  private tradingDateKey(date: number): TradingDate {
    const raw = String(date)
    const key = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6)}`
    const value = new Date(`${key}T00:00:00Z`)
    if (
      !isTradingDate(key) ||
      !Number.isFinite(value.getTime()) ||
      value.toISOString().slice(0, 10) !== key
    ) {
      throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, `Invalid trading date "${date}"`)
    }
    return key
  }

  /** 校验并解析目标行情，返回与视图切换合并提交的操作。 */
  preparePrimarySelection(primary: SymbolSpec | null, date?: number): () => void {
    const spec = primary === null ? null : Object.freeze(structuredClone(primary))
    const active = this._activeSelection
    const tradingDate = date === undefined ? undefined : this.tradingDateKey(date)
    if (spec === null) return () => this.commitPrimarySelection(null, null)
    if (!spec.instrument.symbol.trim() || !spec.instrument.source.trim()) {
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_PARAM,
        'Instrument symbol and source are required',
      )
    }
    if (!isTimeSharePeriod(spec.period)) {
      const selection = this.barsSelectionForSpec(spec)
      return () => this.commitPrimarySelection(spec, selection)
    }
    const latest = this.timeShareSelectionForSpec(spec, tradingDate)
    const selection =
      tradingDate === undefined &&
      active?.kind === SERIES_SELECTION_KIND.timeShare &&
      active.instrumentKey === latest.instrumentKey &&
      active.source === latest.source
        ? active
        : latest
    return () => this.commitPrimarySelection(spec, selection)
  }

  private commitPrimarySelection(
    spec: SymbolSpec | null,
    selection: BarsSelection | TimeShareSelection | null,
  ): void {
    const active = this._activeSelection
    const nextKey = selection === null ? null : seriesSelectionKey(selection)
    const activeKey = active === null ? null : seriesSelectionKey(active)
    if (nextKey !== activeKey) {
      this._dmState.actions.setRangeInitialized(false)
      this._hasActiveData = false
      this.deps.resetInteraction()
      this.disposeActiveSeries()
    }
    this.deps.publishSymbols(spec === null ? [] : [spec])
    this._dmState.actions.setCurrentSpec(spec)
    if (!spec || !selection) {
      this._comparisonManager.clearAll()
      this.publishEmptySnapshot()
      return
    }
    if (selection.kind === SERIES_SELECTION_KIND.bars) {
      this._timeShare?.dispose()
      this._timeShare = null
      this._bars ??= this.deps.data.bars(this.normalizeSpec(spec), {
        aggregation: ORIGINAL_BAR_AGGREGATION,
        initialBars: DEFAULT_BAR_PAGE_LIMIT,
      })
    } else {
      this._bars?.dispose()
      this._bars = null
      this._timeShare ??= this.deps.data.timeShare(this.normalizeSpec(spec), {
        days:
          spec.period === FIVE_DAY_TIME_SHARE_PERIOD ? FIVE_DAY_TIME_SHARE_DAYS : 1,
        ...(selection.tradingDate === LATEST_TRADING_DATE
          ? {}
          : { tradingDate: selection.tradingDate }),
      })
    }
    this.bindActiveSeries(selection)
  }

  /** 整体切换主品种；视图定位由 Chart 负责。 */
  setPrimaryMarket(spec: SymbolSpec | null, date?: number): void {
    const commit = this.preparePrimarySelection(spec, date)
    batch(() => {
      commit()
    })
  }

  private disposeActiveSeries(): void {
    this.unbindActiveSeries()
    this._activeSelection = null
    this.deps.projectIndicatorFeed(null, null)
    this._timeShareIndicatorBars?.dispose()
    this._timeShareIndicatorBars = null
    this._bars?.dispose()
    this._bars = null
    this._timeShare?.dispose()
    this._timeShare = null
  }

  // ── 成交流 ──

  /** 成交需求与活动品种共同决定唯一序列。 */
  reconcileTradeInput(): void {
    const current = this._dmState.readonly.currentSpec.peek()
    const bars = this._activeData
    if (!current || !bars || bars.timezone === null || !this.deps.needsTrades()) {
      this.disposeTrades()
      return
    }
    const spec: SymbolSpec = { ...current, instrument: bars.instrument }
    if (!this._trades) {
      this._trades = this.deps.data.trades(spec)
      this._tradesUnsub = this._trades.snapshot.subscribe(() => {
        const trades = this._trades
        if (trades) this.deps.updateTradeInput(trades.snapshot.peek())
      })
      this.deps.updateTradeInput(this._trades.snapshot.peek())
    }
    this.scheduleTradeDemand()
  }

  private scheduleTradeDemand(): void {
    if (this._tradeTimer !== null) return
    this._tradeTimer = setTimeout(() => {
      this._tradeTimer = null
      this.requestTrades()
    }, 200)
  }

  private requestTrades(): void {
    const bars = this._activeData
    const trades = this._trades
    if (!bars || !trades) return
    const data = bars.getRawData()
    const range = this.getVisibleRangeOrNull()
    if (!range || data.length === 0) return
    const from = data[Math.max(0, range.start)]?.timestamp
    const to = data[Math.min(range.end, data.length - 1)]?.timestamp
    if (from === undefined || to === undefined || to <= from) return
    void trades.load({ from, to }).catch(() => {})
  }

  private disposeTrades(): void {
    if (this._tradeTimer !== null) {
      clearTimeout(this._tradeTimer)
      this._tradeTimer = null
    }
    this._tradesUnsub?.()
    this._tradesUnsub = null
    this._trades?.dispose()
    this._trades = null
    this.deps.updateTradeInput(EMPTY_TRADE_SNAPSHOT)
  }

  // ── 脚本临时计算 ──

  /** 用当前图表行情执行一次临时计算，不注册定义。 */
  async withIndicatorMarketContext<T>(
    bars: readonly KLineData[],
    compute: (market: IndicatorMarketContext) => Promise<T>,
  ): Promise<T> {
    const spec = this._dmState.readonly.currentSpec.peek()
    const series = this._activeData
    if (!spec || !series) throw new Error('当前没有可用的 K 线序列')
    const session = {
      instrument: series.instrument,
      selection: this.barsSelectionForSpec(spec),
    }
    return compute({
      symbol: session.instrument.symbol,
      time: createScriptTimeContext(session, this.deps.marketSessions),
      loadBars: (request, signal) =>
        readIndicatorBars(
          { data: this.deps.data, sessions: this.deps.marketSessions },
          bars,
          request,
          session,
          signal,
        ),
    })
  }

  // ── 内部辅助 ──

  private getVisibleRangeOrNull(): VisibleRange | null {
    if (this.deps.viewport.readonly.viewWidth.peek() === 0) return null
    return this.deps.viewport.readonly.visibleRange.peek()
  }

  private getRawVisibleRangeOrNull(): VisibleRange | null {
    if (this.deps.viewport.readonly.viewWidth.peek() === 0) return null
    return this.deps.viewport.readonly.rawVisibleRange.peek()
  }

  private scheduleIncrementalLoadHintFlush(selection: SeriesSelection): void {
    if (
      this._dmState.readonly.pendingIncrementalLoad.peek().count <= 0 ||
      this._pendingIncrementalLoadFlushTimer !== null
    ) {
      return
    }
    this._pendingIncrementalLoadFlushTimer = setTimeout(() => {
      this._pendingIncrementalLoadFlushTimer = null
      if (!this.isActiveSelection(selection)) return
      const active = this._activeData ?? this._activeTimeShare
      if (!active || active.loading.peek()) return
      const { count, leftBufferWidth } = this._dmState.actions.flushIncrementalLoad()
      if (count > 0) this._loadHint.show(count, leftBufferWidth)
    }, 0)
  }

  destroy(): void {
    if (this._disposed) return
    this._disposed = true
    this._comparisonSpecsUnsub()
    this._comparisonManager.clearAll()
    this.disposeTrades()
    this.disposeActiveSeries()
    this._loadHint.destroy()
    if (this._pendingIncrementalLoadFlushTimer !== null) {
      clearTimeout(this._pendingIncrementalLoadFlushTimer)
      this._pendingIncrementalLoadFlushTimer = null
    }
  }
}
