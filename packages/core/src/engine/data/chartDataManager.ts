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
import { symbolInfoIdentityKey } from './symbolIdentity.js'

/** 图表需要的数据与视图依赖；行情相关只保留统一服务。 */
export interface DataDependencies {
  readonly data: MarketDataService
  readonly marketSessions: MarketSessionRegistry
  updateTradeInput: (input: TradeSnapshot) => void
  needsTrades: () => boolean
  /** scroll / dpr / 可见区间 / 几何 SSOT */
  viewport: Pick<ViewportStateModule, 'readonly'>
  preserveViewOnPrepend: (previousScroll: number, count: number) => void
  showHistoryPrepend: (count: number) => void
  /** 对比叠加状态 SSOT */
  comparison: ComparisonStateModule
  scheduleDraw: (level?: UpdateLevel) => void
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
type ActiveSeries =
  | { kind: 'bars'; selection: BarsSelection; series: BarsSeries }
  | { kind: 'timeShare'; selection: TimeShareSelection; series: TimeShareSeries }

type PreparedPrimarySeries =
  | { spec: null; selection: null; bars: null }
  | { spec: SymbolSpec; selection: BarsSelection; bars: BarsSeries }
  | { spec: SymbolSpec; selection: TimeShareSelection; bars: null }

export class ChartDataManager {
  static readonly TIME_SHARE_INDICATOR_BAR_LIMIT = 1_500

  private readonly deps: DataDependencies
  private readonly _dataState: DataStateModule
  private readonly _dmState: DataManagerStateModule
  private readonly _comparisonManager: ComparisonManager
  private readonly _comparisonSpecsUnsub: () => void

  private active: ActiveSeries | null = null
  private _trades: TradesSeries | null = null
  private _tradesUnsub: (() => void) | null = null
  private _tradeTimer: ReturnType<typeof setTimeout> | null = null
  private unsubscribeActive: (() => void) | null = null
  private _lastDataChange: DataChange<KLineData> | DataChange<TimeShareData> | null = null
  private _timeShareIndicatorBars: BarsSeries | null = null
  private prependedCount = 0
  private _disposed = false

  constructor(deps: DataDependencies, dataState: DataStateModule, dmState: DataManagerStateModule) {
    this.deps = deps
    this._dataState = dataState
    this._dmState = dmState
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
    return this.active?.kind === 'bars' ? this.active.series : null
  }

  private get _activeTimeShare(): TimeShareSeries | null {
    return this.active?.kind === 'timeShare' ? this.active.series : null
  }

  private isActiveSelection(selection: SeriesSelection): boolean {
    return (
      this.active !== null &&
      seriesSelectionKey(this.active.selection) === seriesSelectionKey(selection)
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
    return this._dataState.readonly.data.peek() as readonly KLineData[]
  }

  /** 当前主序列的提交版本，供绘制投影判断行情是否变化。 */
  getRenderDataRevision(): number {
    return this._dataState.readonly.dataRevision.peek()
  }

  getRenderData(): ReadonlyArray<KLineData | TimeShareData> {
    return this._dataState.readonly.data.peek()
  }

  getData(): readonly KLineData[] {
    const snapshot = this._dataState.readonly.activeBuffer.peek()
    return snapshot.kind === ACTIVE_BUFFER_KIND.bars ? snapshot.data : []
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
    const active = this.active
    if (!active) return false
    if (active.kind === 'bars') {
      const { selection, series: bars } = active
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
    const { selection, series } = active
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

  private bindActiveSeries(active: ActiveSeries): void {
    this.unbindActiveSeries()
    this.active = active
    const { series, selection } = active
    if (active.kind === 'bars') this.deps.projectIndicatorFeed(active.selection, null)
    const unsubscribers = [
      series.data.subscribe(() => { if (this.active === active) this.handleData(selection) }),
      series.loading.subscribe(() => { if (this.active === active) this.handleLoading(selection) }),
      series.lastError.subscribe(() => { if (this.active === active) this.publishSnapshot(false) }),
    ]
    this.unsubscribeActive = () => {
      for (const unsubscribe of unsubscribers) unsubscribe()
    }
    if (this.publishSnapshot(true)) this.onDataChanged(selection)
  }

  private unbindActiveSeries(): void {
    this.unsubscribeActive?.()
    this.unsubscribeActive = null
    this._lastDataChange = null
  }

  private handleData(selection: SeriesSelection): void {
    if (!this.isActiveSelection(selection)) return
    const previousScroll = this._dataState.readonly.dataLength.peek() > 0
      ? this.deps.viewport.readonly.scroll.peek()
      : null
    batch(() => {
      if (this.publishSnapshot(false)) this.onDataChanged(selection, previousScroll)
    })
  }

  private handleLoading(selection: SeriesSelection): void {
    if (!this.isActiveSelection(selection)) return
    this.publishSnapshot(false)
    if (this.active?.series.loading.peek() === false && this.prependedCount > 0) {
      const count = this.prependedCount
      this.prependedCount = 0
      this.deps.showHistoryPrepend(count)
    }
  }

  private onDataChanged(selection: SeriesSelection, previousScroll: number | null = null): void {
    if (selection.kind === SERIES_SELECTION_KIND.timeShare) {
      this.onTimeShareChanged()
      return
    }
    const bars = this._activeData
    if (!bars) return
    const change = bars.data.peek()
    const prepended =
      change.kind === DATA_CHANGE_KINDS.prepend
        ? change.end - change.start
        : (change.prependedCount ?? 0)
    if (previousScroll !== null && (change.kind === DATA_CHANGE_KINDS.replace || prepended > 0)) {
      this.deps.resetInteraction()
    }
    if (previousScroll !== null && prepended > 0) {
      this.deps.preserveViewOnPrepend(previousScroll, prepended)
      this.prependedCount += prepended
    }
    if (this.deps.needsTrades()) this.reconcileTradeInput()
  }

  private onTimeShareChanged(): void {
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
    return this._activeData.ensureCoverageFrom(fromTs)
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
        this.deps.viewport.readonly.domScroll.peek(),
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
  preparePrimarySelection(primary: SymbolSpec | null, date?: number): PreparedPrimarySeries {
    const spec = primary === null ? null : Object.freeze(structuredClone(primary))
    const active = this.active?.selection
    const tradingDate = date === undefined ? undefined : this.tradingDateKey(date)
    if (spec === null) return { spec: null, selection: null, bars: null }
    if (!spec.instrument.symbol.trim() || !spec.instrument.source.trim()) {
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_PARAM,
        'Instrument symbol and source are required',
      )
    }
    if (!isTimeSharePeriod(spec.period)) {
      const selection = this.barsSelectionForSpec(spec)
      const bars = this.deps.data.bars(this.normalizeSpec(spec), {
        aggregation: ORIGINAL_BAR_AGGREGATION,
        initialBars: DEFAULT_BAR_PAGE_LIMIT,
        deferLive: true,
      })
      return { spec, selection, bars }
    }
    const latest = this.timeShareSelectionForSpec(spec, tradingDate)
    const selection =
      tradingDate === undefined &&
      active?.kind === SERIES_SELECTION_KIND.timeShare &&
      active.instrumentKey === latest.instrumentKey &&
      active.source === latest.source
        ? active
        : latest
    return { spec, selection, bars: null }
  }

  commitPrimarySelection({ spec, selection, bars }: PreparedPrimarySeries): void {
    const previous = this.active
    const sameSelection = selection && this.isActiveSelection(selection)
    const reuseTimeShare = sameSelection && previous?.kind === 'timeShare' &&
      this._dmState.readonly.currentPeriod.peek() === spec?.period
    if (!sameSelection || (previous?.kind === 'timeShare' && !reuseTimeShare)) {
      this.deps.resetInteraction()
      this.disposeActiveSeries()
    }
    this.deps.publishSymbols(spec === null ? [] : [spec])
    if (!spec || !selection) {
      this._comparisonManager.clearAll()
      this.publishEmptySnapshot()
      return
    }
    if (selection.kind === SERIES_SELECTION_KIND.bars) {
      if (bars === null) throw new Error('缺少已准备的 K 线序列')
      const replaced = this.active
      this.bindActiveSeries({ kind: 'bars', selection, series: bars })
      replaced?.series.dispose()
      return
    }
    if (reuseTimeShare) return
    const series = this.deps.data.timeShare(this.normalizeSpec(spec), {
      days: spec.period === FIVE_DAY_TIME_SHARE_PERIOD ? FIVE_DAY_TIME_SHARE_DAYS : 1,
      ...(selection.tradingDate === LATEST_TRADING_DATE ? {} : { tradingDate: selection.tradingDate }),
    })
    this.bindActiveSeries({ kind: 'timeShare', selection, series })
  }

  private disposeActiveSeries(): void {
    this.unbindActiveSeries()
    const previous = this.active
    this.active = null
    this.prependedCount = 0
    this.deps.projectIndicatorFeed(null, null)
    this.disposeTrades()
    this._timeShareIndicatorBars?.dispose()
    this._timeShareIndicatorBars = null
    previous?.series.dispose()
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

  destroy(): void {
    if (this._disposed) return
    this._disposed = true
    this._comparisonSpecsUnsub()
    this._comparisonManager.clearAll()
    this.disposeActiveSeries()
  }
}
