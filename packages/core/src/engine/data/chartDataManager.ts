/** 行情协调器：管理 Repository、数据加载与各视图的数据投影。 */
import type { IndicatorMarketContext } from '@363045841yyt/klinechart-plot-contracts'
import { formatDateInTimeZone } from '@/foundation/time/index.js'
import {
  FIVE_DAY_TIME_SHARE_DAYS,
  FIVE_DAY_TIME_SHARE_PERIOD,
  isTimeSharePeriod,
  type SymbolInfo,
  type SymbolSpec,
} from '../../controllers/types.js'
import { DataBuffer } from '../../data/buffer/impl/dataBuffer.js'
import {
  MarketDataCache,
  type TimeShareCacheQuery,
} from '../../data/buffer/impl/marketDataCache.js'
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
} from '../../data/buffer/impl/seriesRepository.js'
import { TimeShareBuffer as TimeShareBufferImpl } from '../../data/buffer/impl/timeShareBuffer.js'
import {
  type CoverageResult,
  DATA_CHANGE_KINDS,
  type DataChange,
  type KLineBuffer,
  type TimeShareBuffer,
} from '../../data/buffer/types.js'
import type { StreamHub } from '../../data/stream/types.js'
import {
  type MarketDataProviderRegistry,
  marketDataProviderRegistry,
} from '../../data/provider/impl/registry.js'
import type {
  BarAggregation,
  InstrumentDescriptor,
  KLineAdjustment,
  SourceCapabilities,
  TradingDate,
} from '../../data/provider/types.js'
import {
  DEFAULT_KLINE_ADJUSTMENT,
  DEFAULT_KLINE_PERIOD,
  isKLineAdjustment,
  isKLinePeriod,
  isTradingDate,
  KLinePeriod,
  OLDER_DATA_STATUS,
  ORIGINAL_BAR_AGGREGATION,
} from '../../data/provider/types.js'
import type { TradeSnapshot } from '../../data/trades/types.js'
import { GENERIC_ERROR_CODES, KLineChartError } from '../../errors.js'
import { MarketSessionRegistry } from '../../foundation/config/marketSession/marketSessionRegistry.js'
import { batch, type ReadonlySignal } from '../../foundation/reactivity/signal.js'
import type { KLineData, TimeShareData } from '../../foundation/types/price.js'
import type { ChartDom } from '../chart/index.js'
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
import { MarketRuntime } from './marketRuntime/impl/marketRuntime.js'
import type { ReadyMarketSession } from './marketRuntime/types.js'
import { ScrollCompensator } from './scrollCompensator.js'
import { symbolInfoIdentityKey } from './symbolIdentity.js'

export interface DataDependencies {
  marketSessions?: MarketSessionRegistry
  invalidateRequests?(): void
  marketDataProviderRegistry?: MarketDataProviderRegistry
  /** 宿主持有的唯一实时连接注册表。 */
  streamHub: StreamHub
  updateTradeInput: (input: TradeSnapshot) => void
  needsTrades: () => boolean
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
  /** 指标数据更新入口：K 线计算 + 可选展示时间戳投影。 */
  updateIndicatorData: (
    data: readonly KLineData[],
    change: import('@363045841yyt/klinechart-plot-contracts').ComputeChange,
    range: VisibleRange,
    dataRevision: number,
    displayTimestamps?: readonly number[] | null,
  ) => void
  isPointerDown: () => boolean
  /** 发布 symbols 选择（含 primary + comparison），只写状态不触发加载 */
  publishSymbols: (symbols: ReadonlyArray<SymbolSpec>) => void
}

const PROVIDER_MARKET_SESSIONS = new MarketSessionRegistry()

/** 一次覆盖请求：共享槽位被复用，`done` 标记保证已返回的结果不被重放。 */
interface CoverageRequest {
  readonly selectionKey: string
  readonly buffer: KLineBuffer
  targetFromTs: number
  done: boolean
  promise: Promise<CoverageResult>
}

export class ChartDataManager {
  private readonly marketRuntime: MarketRuntime
  private disposed = false
  private readonly loadRequests = new WeakMap<KLineBuffer | TimeShareBuffer, object>()
  private readonly readySessions = new WeakMap<KLineBuffer, ReadyMarketSession>()
  private readonly barLoads = new Map<KLineBuffer, AbortController>()
  /** 当前页的结算 Promise；覆盖循环据此等待在途请求，不另建第二套加载状态。 */
  private readonly pageSettled = new WeakMap<KLineBuffer, Promise<void>>()
  /** 唯一在途的覆盖请求；同 buffer 上的新请求只收窄下界并共享同一次循环。 */
  private coverageRequest: CoverageRequest | null = null

  /** 成交需求与活动品种共同决定唯一 Buffer，不由 renderer 创建网络连接。 */
  reconcileTradeInput(): void {
    this.marketRuntime.reconcileTrades()
  }
  /** K 线请求实际解析出的来源与品种，供成交连接与就绪身份共用。 */
  private readonly resolvedBarSources = new WeakMap<
    KLineBuffer,
    {
      source: string
      instrument: InstrumentDescriptor
      capabilities: SourceCapabilities | undefined
    }
  >()
  static readonly TIME_SHARE_INDICATOR_BAR_LIMIT = 1_500

  /** 图表与 Agent 共用的实例级行情缓存，负责分页、重试和 Provider 请求。 */
  readonly marketDataCache: MarketDataCache
  private readonly providerRegistry: MarketDataProviderRegistry
  private readonly unsubscribeProviderRegistry: () => void
  private get _repository() {
    return this.marketDataCache.repository
  }
  private get _activeSelection(): SeriesSelection | null {
    return this._dataState.readonly.activeSelection.peek()
  }

  private _dataState: DataStateModule
  private _dmState: DataManagerStateModule
  private _dataUnsub: (() => void) | null = null
  private _loadingUnsub: (() => void) | null = null
  private _errorUnsub: (() => void) | null = null
  private _lastDataChange: DataChange<KLineData> | DataChange<TimeShareData> | null = null
  private timeShareIndicatorRequest: AbortController | undefined

  private _scrollCompensator: ScrollCompensator
  private _comparisonManager: ComparisonManager
  private _comparisonSpecsUnsub: (() => void) | null = null
  private _loadHint: IncrementalLoadHint
  private _pendingIncrementalLoadFlushTimer = 0

  /** 跨周期行情复用市场运行模块。 */
  get indicatorMarketData(): import('../calculation/index.js').CalculationMarketData {
    return this.marketRuntime
  }

  /** 临时计算的行情使用权也由唯一市场运行模块管理。 */
  withIndicatorMarketContext<T>(
    bars: readonly KLineData[],
    compute: (market: IndicatorMarketContext) => Promise<T>,
  ): Promise<T> {
    return this.marketRuntime.withContext(bars, compute)
  }

  private deps: DataDependencies

  constructor(deps: DataDependencies, dataState: DataStateModule, dmState: DataManagerStateModule) {
    this.providerRegistry = deps.marketDataProviderRegistry ?? marketDataProviderRegistry
    this.marketDataCache = new MarketDataCache(this.providerRegistry)
    this.deps = deps
    this._dataState = dataState
    this._dmState = dmState

    this.marketRuntime = new MarketRuntime({
      marketSessions: deps.marketSessions,
      registry: this.providerRegistry,
      stream: deps.streamHub,
      cache: this.marketDataCache,
      session: dataState.readonly.readyMarket,
      visibleRange: deps.viewport.readonly.visibleRange,
      data: dataState.readonly.data,
      needsTrades: () => deps.needsTrades(),
      invalidateRequests: () => deps.invalidateRequests?.(),
      resolveBarsSelection: (instrument, period, adjustment, barAggregation) => {
        const specs = [...this.symbols.peek(), ...this.deps.comparison.readonly.specs.peek()]
        const matching = specs.find((spec) => spec.instrument.id === instrument.id)
        const spec: SymbolSpec =
          matching === undefined
            ? { instrument, period, adjust: adjustment }
            : { ...matching, period, adjust: adjustment }
        return { ...this.barsSelectionForSpec(spec), barAggregation }
      },
      publishTrades: (snapshot) => deps.updateTradeInput(snapshot),
      resyncBars: (session, buffer, signal) =>
        this.loadBars(
          session.selection,
          buffer,
          {
            instrument: session.instrument,
            period: session.selection.period,
            adjust: session.selection.adjustment,
          },
          {
            limit: Math.max(buffer.getRawData().length, DEFAULT_BAR_PAGE_LIMIT),
            refresh: true,
            signal,
          },
        ),
    })
    this._scrollCompensator = new ScrollCompensator(deps)
    this._loadHint = new IncrementalLoadHint(deps)
    this._comparisonManager = new ComparisonManager(this._repository, {
      selectionForSpec: (spec) => this.barsSelectionForSpec(this.comparisonSpecForPrimary(spec)),
      createBuffer: (_spec, selection) => this.createKLineBuffer(selection),
      loadBuffer: (spec, selection, buffer) =>
        this.loadBufferSnapshot(this.comparisonSpecForPrimary(spec), selection, buffer),
      loadRange: (spec, selection, buffer, beforeTimestamp) =>
        this.loadBars(selection, buffer, this.comparisonSpecForPrimary(spec), {
          limit: DEFAULT_BAR_PAGE_LIMIT,
          beforeTimestamp,
        }),
      releaseSelection: (selection) => this.releaseComparisonSelection(selection),
      scheduleDraw: () => this.deps.scheduleDraw(),
      getSpecs: () => this.deps.comparison.readonly.specs.peek(),
      setLoading: (loading) => this.deps.comparison.actions.setLoading(loading),
    })
    this._comparisonSpecsUnsub = this.deps.comparison.readonly.specs.subscribe(() => {
      this.reconcileComparisonBuffers()
    })
    this.reconcileComparisonBuffers()
    this.unsubscribeProviderRegistry = this.providerRegistry.state.subscribe(() => {
      if (this.disposed) return
      const active = this._activeSelection
      // 缓存先释放旧连接的快照；图表再加载，避免新实时流混入旧历史数据。
      if (active && !this._repository.get(active)) {
        const specs = this.symbols.peek()
        this.publishEmptySnapshot()
        this.setPrimaryMarket(specs[0] ?? null)
      } else {
        this.reconcileComparisonBuffers()
      }
    })
  }

  // ── Buffer helpers ──

  private lookupBuffer(selection: SeriesSelection): KLineBuffer | TimeShareBuffer | undefined {
    return this._repository.get(selection)
  }

  /** 将业务品种转换为 Repository K 线选择。 */
  private barsSelectionForSpec(spec: SymbolSpec): BarsSelection {
    const period = ChartDataManager.normalizePeriod(spec.period)
    const adjustment = spec.adjust ?? DEFAULT_KLINE_ADJUSTMENT
    if (!isKLinePeriod(period)) {
      throw new Error(`[ChartDataManager] invalid K-line period "${period}"`)
    }
    if (!isKLineAdjustment(adjustment)) {
      throw new Error(`[ChartDataManager] invalid K-line adjustment "${adjustment}"`)
    }
    const existing = this.marketRuntime.findBarsSelection(
      spec,
      period,
      adjustment,
      this.barAggregation(),
    )
    if (existing !== undefined) return existing
    return {
      kind: SERIES_SELECTION_KIND.bars,
      instrumentKey: instrumentKeyFromSpec(spec),
      source: sourceFromSpec(spec),
      period,
      adjustment,
      barAggregation: this.barAggregation(),
    }
  }

  /** 原生比较沿用主品种的原始 K 线桶，增删比较不会重建主 Buffer。 */
  private barAggregation(): BarAggregation {
    return ORIGINAL_BAR_AGGREGATION
  }

  /** 比较品种沿用主图的周期与复权；切到分时时保留主图已选择的 K 线周期。 */
  private comparisonSpecForPrimary(spec: SymbolSpec): SymbolSpec {
    const primary = this._dataState.readonly.symbols.peek()[0]
    if (!primary) return spec
    const primaryPeriod = primary.period
    const period =
      primaryPeriod === undefined || isTimeSharePeriod(primaryPeriod) ? spec.period : primaryPeriod
    return {
      ...spec,
      ...(period === undefined ? {} : { period }),
      ...(primary.adjust === undefined ? {} : { adjust: primary.adjust }),
    }
  }

  /** 将业务品种转换为 Repository 分时选择。 */
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
    const dataChanged = this.publishBufferSnapshot(selection, buf, true)
    if (dataChanged) {
      this.onBufferDataChanged(selection)
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

  /** 判断给定选择是否仍是当前活动选择。 */
  private isActiveSelection(selection: SeriesSelection): boolean {
    const active = this._activeSelection
    return active !== null && seriesSelectionKey(active) === seriesSelectionKey(selection)
  }

  /** 已加载 Buffer 派生稳定就绪身份；实时更新和分页不重建连接。 */
  private readySession(selection: BarsSelection, buffer: KLineBuffer): ReadyMarketSession | null {
    const source = this.resolvedBarSources.get(buffer)
    if (!source?.capabilities || buffer.timezone === null || selection.source !== source.source)
      return null
    const previous = this.readySessions.get(buffer)
    if (
      previous &&
      seriesSelectionKey(previous.selection) === seriesSelectionKey(selection) &&
      JSON.stringify(previous.instrument) === JSON.stringify(source.instrument) &&
      JSON.stringify(previous.capabilities) === JSON.stringify(source.capabilities)
    )
      return previous
    const session = Object.freeze({
      selection,
      instrument: Object.freeze(structuredClone(source.instrument)),
      capabilities: Object.freeze(structuredClone(source.capabilities)),
    })
    this.readySessions.set(buffer, session)
    return session
  }

  /** 发布数据和就绪来源的完整快照，连接只观察这一次原子通知。 */
  private publishBufferSnapshot(
    selection: SeriesSelection,
    buf: KLineBuffer | TimeShareBuffer,
    forceData: boolean,
  ): boolean {
    const dataChange = buf.data.peek()
    const dataChanged = forceData || dataChange !== this._lastDataChange
    if (dataChanged) this._lastDataChange = dataChange

    if (selection.kind === SERIES_SELECTION_KIND.bars) {
      const buffer = buf as KLineBuffer
      this._dataState.actions.applyActiveBufferSnapshot(
        {
          kind: ACTIVE_BUFFER_KIND.bars,
          selection,
          data: dataChanged
            ? buffer.data.peek().data
            : (this._dataState.readonly.data.peek() as ReadonlyArray<KLineData>),
          loading: buffer.loading.peek(),
          error: buffer.lastError.peek(),
          timezone: buffer.timezone,
          timeShareRange: null,
          timeSharePreClose: null,
        },
        this.readySession(selection, buffer),
      )
    } else {
      const buffer = buf as TimeShareBuffer
      this._dataState.actions.applyActiveBufferSnapshot({
        kind: ACTIVE_BUFFER_KIND.timeShare,
        selection,
        data: dataChanged
          ? buffer.data.peek().data
          : (this._dataState.readonly.data.peek() as ReadonlyArray<TimeShareData>),
        loading: buffer.loading.peek(),
        error: buffer.lastError.peek(),
        timezone: buffer.range.peek()?.timezone ?? null,
        timeShareRange: buffer.range.peek(),
        timeSharePreClose: buffer.getPreClose(),
      })
    }

    return dataChanged
  }

  private handleBufferDataEvent(selection: SeriesSelection): void {
    if (!this.isActiveSelection(selection)) return
    const buf = this.lookupBuffer(selection)
    if (!buf) return
    if (!this.publishBufferSnapshot(selection, buf, false)) return
    this.onBufferDataChanged(selection)
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
    return selection?.kind === SERIES_SELECTION_KIND.bars
      ? (this._repository.getBars(selection) ?? null)
      : null
  }

  private getActiveTimeShareBuffer(): TimeShareBuffer | null {
    const selection = this._activeSelection
    return selection?.kind === SERIES_SELECTION_KIND.timeShare
      ? (this._repository.getTimeShare(selection) ?? null)
      : null
  }

  /** 创建仅接收缓存查询结果的 K 线图表快照。 */
  private createKLineBuffer(selection?: BarsSelection): KLineBuffer {
    void selection
    return new DataBuffer()
  }

  /** 请求令牌是否仍是该 Buffer 的当前加载；过期、被替换或已销毁时为 false。 */
  private isCurrentLoad(buffer: KLineBuffer | TimeShareBuffer, request: object): boolean {
    return !this.disposed && this.loadRequests.get(buffer) === request
  }

  /**
   * 发起一页请求，并把结算 Promise 登记为该 Buffer 的当前页。
   *
   * 同一 Buffer 同时只能有一页在途（缓存层会取消上一页），覆盖循环与新的触发都通过
   * 这份登记等待它，不再各自维护加载状态。
   */
  private loadBars(
    selection: BarsSelection,
    buffer: KLineBuffer,
    spec: SymbolSpec,
    target: { limit: number; beforeTimestamp?: number; refresh?: boolean; signal?: AbortSignal },
  ): Promise<void> {
    const page = this.fetchBars(selection, buffer, spec, target)
    this.pageSettled.set(
      buffer,
      page.then(
        () => {},
        () => {},
      ),
    )
    return page
  }

  /** 从共享缓存获取 K 线并写入当前图表快照。 */
  private async fetchBars(
    selection: BarsSelection,
    buffer: KLineBuffer,
    spec: SymbolSpec,
    target: { limit: number; beforeTimestamp?: number; refresh?: boolean; signal?: AbortSignal },
  ): Promise<void> {
    const request = {}
    this.barLoads.get(buffer)?.abort()
    const abort = new AbortController()
    const signal = target.signal ? AbortSignal.any([abort.signal, target.signal]) : abort.signal
    this.barLoads.set(buffer, abort)
    this.loadRequests.set(buffer, request)
    const period = spec.period ?? DEFAULT_KLINE_PERIOD
    const adjustment = spec.adjust ?? DEFAULT_KLINE_ADJUSTMENT
    if (!isKLinePeriod(period) || !isKLineAdjustment(adjustment)) {
      throw new Error(`[MarketDataCache] invalid bars request for "${spec.instrument.symbol}"`)
    }
    buffer.setLoading(true)
    // 数据源可能不及时结束 Promise；取消时立即释放本任务拥有的加载状态。
    const releaseLoading = () => {
      if (this.isCurrentLoad(buffer, request)) buffer.setLoading(false)
    }
    signal.addEventListener('abort', releaseLoading, { once: true })
    if (signal.aborted) releaseLoading()
    try {
      const query = {
        signal,
        source: spec.instrument.source,
        instrument: spec.instrument,
        symbol: spec.instrument.symbol,
        exchange: spec.instrument.exchange,
        instrumentType: spec.instrument.instrumentType,
        period,
        adjustment,
        barAggregation: selection.barAggregation,
        limit: target.limit,
        ...(target.beforeTimestamp === undefined
          ? {}
          : { beforeTimestamp: target.beforeTimestamp }),
      }
      const result = target.refresh
        ? await this.marketDataCache.refreshBars(query)
        : await this.marketDataCache.queryBars(query)
      if (signal.aborted || !this.isCurrentLoad(buffer, request)) return
      if (!this.isActiveSelection(selection) && this._repository.getBars(selection) !== buffer)
        return
      // 来源必须先于任何 Kernel/Buffer 通知就绪；通知的订阅者会立即协调成交连接。
      this.resolvedBarSources.set(buffer, {
        source: result.source,
        instrument: result.instrument,
        capabilities: structuredClone(
          this.providerRegistry.get(result.source)?.source.capabilities,
        ),
      })
      const previousEarliest = buffer.loadedTimeRange?.earliestTs
      if (target.refresh) {
        buffer.replace(result.series.data, result.series.olderData, result.series.timezone)
      } else buffer.mergePage(result.series.data, result.series.olderData, result.series.timezone)
      if (
        this.deps.comparison.readonly.specs
          .peek()
          .some(
            (comparison) =>
              seriesSelectionKey(
                this.barsSelectionForSpec(this.comparisonSpecForPrimary(comparison)),
              ) === seriesSelectionKey(selection),
          )
      ) {
        const session = this.readySession(selection, buffer)
        if (session !== null) this.marketRuntime.retainComparison(session, buffer)
      }
      if (
        this.isActiveSelection(selection) &&
        (target.refresh || buffer.loadedTimeRange?.earliestTs !== previousEarliest)
      ) {
        this.deps.onBarsReady()
      }
    } catch (error) {
      if (!signal.aborted && this.isCurrentLoad(buffer, request))
        buffer.setError(error instanceof Error ? error.message : String(error))
      if (target.refresh) throw error
    } finally {
      signal.removeEventListener('abort', releaseLoading)
      releaseLoading()
      if (this.barLoads.get(buffer) === abort) this.barLoads.delete(buffer)
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
    // 交易日与轴标签共用 Foundation 的显示时区格式化，不再就地构造 Intl。
    const timeZone = PROVIDER_MARKET_SESSIONS.getRequired(instrument.sessionId).timeZone
    return formatDateInTimeZone(Date.now(), timeZone) as TradingDate
  }

  /** 从共享缓存获取单日分时并写入当前图表快照。 */
  private async loadTimeShare(
    selection: TimeShareSelection,
    buffer: TimeShareBuffer,
    spec: SymbolSpec,
  ): Promise<void> {
    await this.runTimeShareLoad(
      selection,
      buffer,
      () => {
        const tradingDate =
          selection.tradingDate === LATEST_TRADING_DATE ? undefined : selection.tradingDate
        const base = this.timeShareQueryBase(spec)
        return this.marketDataCache.queryTimeShare(
          tradingDate
            ? { ...base, tradingDate }
            : { ...base, resolveTradingDate: (instrument) => this.resolveTradingDate(instrument) },
        )
      },
      (result) => buffer.setInlineData(result.series.data, result.series.preClose),
    )
  }

  /** 从共享缓存获取多日分时并写入当前图表快照。 */
  private async loadTimeShareRange(
    selection: TimeShareSelection,
    buffer: TimeShareBuffer,
    spec: SymbolSpec,
    days: number,
  ): Promise<void> {
    await this.runTimeShareLoad(
      selection,
      buffer,
      () => {
        const endTradingDate =
          selection.tradingDate === LATEST_TRADING_DATE ? undefined : selection.tradingDate
        const base = this.timeShareQueryBase(spec)
        return this.marketDataCache.queryTimeShareRange(
          endTradingDate
            ? { ...base, endTradingDate, days }
            : {
                ...base,
                resolveEndTradingDate: (instrument) => this.resolveTradingDate(instrument),
                days,
              },
        )
      },
      (result) => buffer.setRange(result.range),
    )
  }

  /**
   * 执行一次分时加载请求，统一处理请求令牌、过期校验、AUTO 源回写与错误写入。
   * @param selection 当前分时选择，用于过期后判断结果是否仍属活动序列。
   * @param buffer 目标分时 Buffer。
   * @param query 发起实际的缓存查询。
   * @param apply 请求成功且未被丢弃时写入结果。
   * @returns 加载完成后的 Promise。
   */
  private async runTimeShareLoad<
    TResult extends { source: string; instrument: InstrumentDescriptor },
  >(
    selection: TimeShareSelection,
    buffer: TimeShareBuffer,
    query: () => Promise<TResult>,
    apply: (result: TResult) => void,
  ): Promise<void> {
    const request = {}
    this.loadRequests.set(buffer, request)
    buffer.setLoading(true)
    try {
      const result = await query()
      if (!this.isCurrentLoad(buffer, request)) return
      if (!this.isActiveSelection(selection) && this.lookupBuffer(selection) !== buffer) return
      apply(result)
    } catch (error) {
      if (this.isCurrentLoad(buffer, request))
        buffer.setError(error instanceof Error ? error.message : String(error))
    }
  }

  /** 分时单日与多日查询共用的来源描述字段。 */
  private timeShareQueryBase(
    spec: SymbolSpec,
  ): Pick<TimeShareCacheQuery, 'source' | 'instrument' | 'symbol' | 'exchange' | 'instrumentType'> {
    return {
      source: spec.instrument.source,
      instrument: spec.instrument,
      symbol: spec.instrument.symbol,
      exchange: spec.instrument.exchange,
      instrumentType: spec.instrument.instrumentType,
    }
  }

  // ── Buffer data change handler ──

  private onBufferDataChanged(selection: SeriesSelection): void {
    if (selection.kind === SERIES_SELECTION_KIND.timeShare) {
      this.onTimeShareBufferChanged()
      return
    }
    const buf = this._repository.getBars(selection)
    if (!buf) return
    this.onKLineBufferChanged(buf, buf.data.peek())
  }

  private onKLineBufferChanged(buf: KLineBuffer, change: DataChange<KLineData>): void {
    const bufferData = buf.getRawData()
    const prependedCount =
      change.kind === DATA_CHANGE_KINDS.prepend
        ? change.end - change.start
        : (change.prependedCount ?? 0)

    if (prependedCount > 0) {
      this._scrollCompensator.compensatePrepend(prependedCount)
    }

    // 只有整体替换或前置插入会让既有序号/下标失效；尾部写入与单根修正不打断手势。
    if (change.kind === DATA_CHANGE_KINDS.replace || prependedCount > 0) {
      this.deps.resetInteraction()
    }

    if (!this._dmState.readonly.rangeInitialized.peek() && bufferData.length > 0) {
      this._dmState.actions.setRangeInitialized(true)
    }

    let currentRange = this.getVisibleRangeOrNull()
    if (!currentRange && this._dmState.readonly.rangeInitialized.peek() && bufferData.length > 0) {
      currentRange = { start: 0, end: bufferData.length }
    }
    if (currentRange) {
      // 指标计算异步提交，提交后由结果链路回调 scheduleDraw / 预警。
      this.deps.updateIndicatorData(
        bufferData,
        {
          start: change.start,
          end: change.end,
          reset: change.kind !== DATA_CHANGE_KINDS.append && change.kind !== DATA_CHANGE_KINDS.tail,
        },
        currentRange,
        this._dataState.readonly.dataRevision.peek(),
      )
    }

    if (prependedCount > 0) {
      this.recordIncrementalLoad(prependedCount)
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
    void this.updateTimeShareIndicators(data)
    this.deps.scheduleDraw()
  }

  /** 分时指标使用 1min K 线计算，再投影到分时坐标，避免伪造 OHLC。 */
  private async updateTimeShareIndicators(data: TimeShareData[]): Promise<void> {
    const spec = this._dmState.readonly.currentSpec.peek()
    const range = this.getVisibleRangeOrNull()
    if (!spec || !range || data.length === 0) return
    this.timeShareIndicatorRequest?.abort()
    const request = new AbortController()
    this.timeShareIndicatorRequest = request
    try {
      const result = await this.marketDataCache.queryBars({
        source: spec.instrument.source,
        instrument: spec.instrument,
        symbol: spec.instrument.symbol,
        exchange: spec.instrument.exchange,
        instrumentType: spec.instrument.instrumentType,
        period: KLinePeriod.Min1,
        adjustment: (spec.adjust ?? DEFAULT_KLINE_ADJUSTMENT) as KLineAdjustment,
        barAggregation: ORIGINAL_BAR_AGGREGATION,
        limit: ChartDataManager.TIME_SHARE_INDICATOR_BAR_LIMIT,
        signal: request.signal,
      })
      if (request.signal.aborted || this.timeShareIndicatorRequest !== request) return
      // 1min K 线计算，结果投影到分时展示时间戳；提交后由结果链路回调重绘。
      this.deps.updateIndicatorData(
        [...result.series.data],
        { start: 0, end: result.series.data.length },
        range,
        this._dataState.readonly.dataRevision.peek(),
        data.map((item) => item.timestamp),
      )
    } catch (error) {
      if (!request.signal.aborted)
        console.error('[TimeShare indicators]', spec.instrument.symbol, error)
    } finally {
      if (this.timeShareIndicatorRequest === request) this.timeShareIndicatorRequest = undefined
    }
  }

  // ── Internal helpers ──

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
        .map((info) => [symbolInfoIdentityKey(info), info]),
    )
    for (const info of infos) current.set(symbolInfoIdentityKey(info), info)
    this._dataState.actions.setSymbolCatalog([...current.values()])
  }

  get currentPeriod(): string {
    return this._dmState.readonly.currentPeriod.peek()
  }

  /** Internal KLine data for indicator scheduler (empty in timeshare mode) */
  getInternalData(): readonly KLineData[] {
    const buf = this.getActiveDataBuffer()
    if (buf) return buf.getRawData()
    const peek = this._dataState.readonly.data.peek()
    return peek.length > 0 ? (peek as readonly KLineData[]) : []
  }

  /** 当前主序列的提交版本，供绘制投影判断行情是否变化。 */
  getRenderDataRevision(): number {
    return this._dataState.readonly.dataRevision.peek()
  }

  /** 比较叠加的数据与配置身份，供帧级主层失效。 */
  getComparisonContentInputs(): readonly unknown[] {
    return [
      this.deps.comparison.readonly.specs.peek(),
      this.deps.comparison.readonly.colors.peek(),
      this.deps.comparison.readonly.hidden.peek(),
      ...this._comparisonManager.getContentInputs(),
    ]
  }

  getRenderData(): ReadonlyArray<KLineData | TimeShareData> {
    // 主品种始终提供渲染数据；比较数据只进入折线投影。
    return this._dataState.readonly.data.peek()
  }

  getTimeShareData(): readonly TimeShareData[] {
    const buf = this.getActiveTimeShareBuffer()
    return buf ? buf.getRawData() : []
  }

  getTimeSharePreClose(): number | null {
    const buf = this.getActiveTimeShareBuffer()
    return buf?.getPreClose() ?? null
  }

  /** 返回当前多日分时的原子分组快照。 */
  getTimeShareRange(): import('../../data/provider/types.js').TimeShareRange | null {
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
    if (!buf) throw new Error('No active K-line series')
    return buf
  }

  getComparisonColors(): Map<string, string> {
    return new Map(this.deps.comparison.readonly.colors.peek())
  }

  /** 返回比较折线隐藏状态供图例渲染。 */
  getComparisonHidden(): ReadonlyMap<string, boolean> {
    return this.deps.comparison.readonly.hidden.peek()
  }

  getData(): readonly KLineData[] {
    const buf = this.getActiveDataBuffer()
    return buf ? buf.getRawData() : []
  }

  /**
   * 让数据池覆盖到 `fromTs`（含）之后的所有行情。
   *
   * 这是唯一的补历史入口：守卫、串行翻页、耗尽判断都在这里，调用方只声明下界。
   * 同一 Buffer 上的并发请求共享一次循环，更早的下界会把目标继续向前推。
   *
   * @param fromTs 需要覆盖的最早时间；`POSITIVE_INFINITY` 表示只要首屏，
   *   `NEGATIVE_INFINITY` 表示补到数据源耗尽
   * @returns `covered` 已覆盖；`exhausted` 数据源无法再向前扩；`superseded` 序列已切换
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
    const buffer = this.getActiveDataBuffer()
    const selection = this._activeSelection
    if (!buffer || selection?.kind !== SERIES_SELECTION_KIND.bars) {
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_PARAM,
        'Coverage requires an active K-line series',
      )
    }
    const loaded = buffer.loadedTimeRange
    if (loaded && loaded.earliestTs <= fromTs) return Promise.resolve('covered')
    if (loaded && !this.canExtend(buffer)) return Promise.resolve('exhausted')

    const selectionKey = seriesSelectionKey(selection)
    const running = this.coverageRequest
    if (
      running &&
      !running.done &&
      running.buffer === buffer &&
      running.selectionKey === selectionKey
    ) {
      running.targetFromTs = Math.min(running.targetFromTs, fromTs)
      return running.promise
    }
    const request: CoverageRequest = {
      selectionKey,
      buffer,
      targetFromTs: fromTs,
      done: false,
      promise: Promise.resolve<CoverageResult>('covered'),
    }
    this.coverageRequest = request
    request.promise = this.drainCoverage(request)
    return request.promise
  }

  /** 逐页推进覆盖循环，直到覆盖、耗尽、无进展或序列切换。 */
  private async drainCoverage(request: CoverageRequest): Promise<CoverageResult> {
    for (;;) {
      if (!this.isCoverageCurrent(request)) return this.finishCoverage(request, 'superseded')
      const buffer = request.buffer
      const loaded = buffer.loadedTimeRange
      if (!loaded) {
        const page = this.pageSettled.get(buffer)
        if (!page) return this.finishCoverage(request, 'exhausted')
        await page
        continue
      }
      if (loaded.earliestTs <= request.targetFromTs) return this.finishCoverage(request, 'covered')
      if (!this.canExtend(buffer)) return this.finishCoverage(request, 'exhausted')
      if (buffer.loading.peek()) {
        const page = this.pageSettled.get(buffer)
        if (!page) return this.finishCoverage(request, 'exhausted')
        await page
        continue
      }
      const spec = buffer.currentSpec
      const selection = this._activeSelection
      if (!spec || selection?.kind !== SERIES_SELECTION_KIND.bars) {
        return this.finishCoverage(request, 'superseded')
      }
      const before = loaded.earliestTs
      await this.loadBars(selection, buffer, spec, {
        limit: DEFAULT_BAR_PAGE_LIMIT,
        beforeTimestamp: before,
      })
      if (!this.isCoverageCurrent(request)) return this.finishCoverage(request, 'superseded')
      const after = buffer.loadedTimeRange
      if (!after || after.earliestTs >= before) return this.finishCoverage(request, 'exhausted')
    }
  }

  /** 结算一次覆盖请求：先标记完成，再释放共享槽位，避免新请求复用已返回的结果。 */
  private finishCoverage(request: CoverageRequest, result: CoverageResult): CoverageResult {
    request.done = true
    if (this.coverageRequest === request) this.coverageRequest = null
    return result
  }

  /** 覆盖请求仍然指向当前活动序列。 */
  private isCoverageCurrent(request: {
    readonly selectionKey: string
    readonly buffer: KLineBuffer
  }): boolean {
    const selection = this._activeSelection
    return (
      selection?.kind === SERIES_SELECTION_KIND.bars &&
      seriesSelectionKey(selection) === request.selectionKey &&
      this._repository.getBars(selection) === request.buffer
    )
  }

  /** 该序列还能否向前扩展：源耗尽或规格显式关闭增量都算不能。 */
  private canExtend(buffer: KLineBuffer): boolean {
    if (buffer.currentSpec?.incremental === false) return false
    return buffer.olderData !== OLDER_DATA_STATUS.EXHAUSTED
  }

  /**
   * 视口贴到已加载左边界时预取一页。
   *
   * 这是覆盖 API 的一个普通调用方：先把下界算成一页之外，再由统一循环取数。
   */
  checkVisibleRangeGap(): void {
    const buf = this.getActiveDataBuffer()
    if (!buf) return
    const data = buf.getRawData()
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
    const loaded = buf.loadedTimeRange
    if (!loaded) return
    void this.ensureCoverageFrom(loaded.earliestTs - 1).catch(() => {})
  }

  // ── Comparison management ──

  private reconcileComparisonBuffers(): void {
    this._comparisonManager.reconcile()
  }

  /** 删除不再被 comparison 或当前主品种引用的 Repository 叶子。 */
  private releaseComparisonSelection(selection: BarsSelection): void {
    if (!this.marketRuntime.releaseComparison(selection)) return
    if (this.isActiveSelection(selection)) return
    const primary = this._dataState.readonly.symbols.peek()[0]
    if (
      primary &&
      selection.kind === SERIES_SELECTION_KIND.bars &&
      !isTimeSharePeriod(primary.period) &&
      seriesSelectionKey(this.barsSelectionForSpec(primary)) === seriesSelectionKey(selection)
    ) {
      return
    }
    this._repository.delete(selection)
  }

  // ── Symbol / Period ──

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

  // ── Main symbol switching ──

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
    if (!selection || !active || seriesSelectionKey(active) !== seriesSelectionKey(selection)) {
      this.timeShareIndicatorRequest?.abort()
      const previous = this.getActiveDataBuffer()
      if (previous) this.barLoads.get(previous)?.abort()
      this._dmState.actions.setRangeInitialized(false)
    }
    this.deps.publishSymbols(spec === null ? [] : [spec])
    this._dmState.actions.setCurrentSpec(spec)
    if (!spec || !selection) {
      this.unbindActiveBuffer()
      this._repository.clear()
      this.publishEmptySnapshot()
    } else if (selection.kind === SERIES_SELECTION_KIND.bars) {
      this.loadPrimaryBars(spec, selection)
    } else {
      const buffer = this._repository.getOrCreateTimeShare(
        selection,
        () => new TimeShareBufferImpl(),
      )
      this.activateBuffer(selection)
      if (spec.period === FIVE_DAY_TIME_SHARE_PERIOD) {
        void this.loadTimeShareRange(selection, buffer, spec, FIVE_DAY_TIME_SHARE_DAYS)
      } else {
        void this.loadTimeShare(selection, buffer, spec)
      }
    }
  }

  /**
   * 整体替换主品种（含周期、复权与来源）。
   *
   * 一次调用完成选择提交；视图定位由 Chart 负责，数据层不读写视口。
   */
  setPrimaryMarket(spec: SymbolSpec | null, date?: number): void {
    const commit = this.preparePrimarySelection(spec, date)
    batch(() => {
      commit()
    })
  }

  private loadPrimaryBars(spec: SymbolSpec, selection: BarsSelection): void {
    const buf = this._repository.getOrCreateBars(selection, () => new DataBuffer())
    this.activateBuffer(selection)
    // 已缓存的序列可以立即投影，后续更新仍由 Provider 运行时负责。
    if (buf.getRawData().length > 0) {
      buf.setCurrentSpec(spec)
      this.deps.resetInteraction()
      return
    }

    buf.setSymbol(spec)
    void this.loadBars(selection, buf, spec, {
      limit: DEFAULT_BAR_PAGE_LIMIT,
    })
  }

  /** 初始化一个 Repository K 线快照，并通过共享缓存填充首个窗口。 */
  private loadBufferSnapshot(
    spec: SymbolSpec,
    selection: BarsSelection,
    buffer: KLineBuffer,
  ): void {
    buffer.setSymbol(spec)
    void this.loadBars(selection, buffer, spec, { limit: DEFAULT_BAR_PAGE_LIMIT })
  }

  // ── Comparison view line range ──

  /** 构建主品种 OHLC 与比较折线的可见投影，供坐标轴和绘制层共同消费。 */
  getComparisonProjection(
    range: VisibleRange,
    kLineCenters: ReadonlyArray<number>,
    scrollLeft: number,
    paneWidth: number,
  ): ComparisonProjection | null {
    if (this.getComparisonSpecs().length === 0) return null
    const data = this._comparisonManager.data
    return projectComparison(
      this.getInternalData(),
      data,
      range,
      kLineCenters,
      scrollLeft,
      paneWidth,
      this.deps.comparison.readonly.hidden.peek(),
    )
  }

  destroy(): void {
    for (const abort of this.barLoads.values()) abort.abort()
    this.barLoads.clear()
    this.unsubscribeProviderRegistry()
    this.disposed = true
    this.timeShareIndicatorRequest?.abort()
    this.marketRuntime.dispose()
    this._comparisonSpecsUnsub?.()
    this._comparisonSpecsUnsub = null
    this._comparisonManager.clearAll()
    this.unbindActiveBuffer()
    this.marketDataCache.destroy()
    this._loadHint.destroy()
  }
}
