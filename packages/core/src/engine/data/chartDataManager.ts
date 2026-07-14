import type { SymbolSpec, SymbolInfo, DataFetcher, CustomDataSource } from '../../controllers/types'
import { DataBuffer } from '../../data/dataBuffer'
import { getPeriodDays } from '../../data/dataBuffer.effects'
import type { KLineBuffer, DataChange } from '../../data/dataBufferTypes'
import { TimeShareBuffer } from '../../data/timeShareBuffer'
import type { TimeShareFetcherFn } from '../../data/types'
import { createSignal, type ReadonlySignal, type Signal } from '../../foundation/reactivity/signal'
import type { KLineData, TimeShareData } from '../../foundation/types/price'
import type { ChartDom, Viewport } from '../chartTypes'
import type { VisibleRange, UpdateLevel } from '../layout/pane'
import { getPhysicalKLineConfig } from '../utils/klineConfig'
import { getVisibleRange } from '../viewport/viewport'
import type { DataStateModule } from '../state/dataState'
import type { DataManagerStateModule } from '../state/dataManagerState'

import { ComparisonManager } from './comparisonManager'
import { FetchBatchScheduler } from './fetchBatchScheduler'
import { IncrementalLoadHint } from './incrementalLoadHint'
import { ScrollCompensator } from './scrollCompensator'

const COMPARISON_PALETTE = ['#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316']
const DEFAULT_COMPARISON_COLOR = '#f59e0b'

export interface DataDependencies {
  getOption: () => { kWidth: number; kGap: number }
  getEffectiveDpr: () => number
  getLogicalScrollLeft: () => number
  getCachedScrollLeft: () => number
  setScrollLeft: (v: number) => void
  getDom: () => ChartDom
  getObservedSize: () => { width: number; height: number }
  getViewport: () => Viewport | null
  getVisibleRange: () => VisibleRange | null
  /** 几何 SSOT：由 kernel viewport.readonly 注入 */
  getLeftLoadBufferWidth: () => number
  getContentWidth: () => number
  scheduleDraw: (level?: UpdateLevel) => void
  resetInteraction: () => void
  getIndicatorScheduler: () => {
    update: (data: KLineData[], range: VisibleRange) => boolean
    busySignal: Signal<boolean>
  }
  isPointerDown: () => boolean
  onTimeShareDataReady: (dataLength: number) => void
  onDataProcessed?: (data: KLineData[], range: VisibleRange) => void
  setComparisonColors: (colors: ReadonlyMap<string, string>) => void
  setComparisonLoading: (loading: boolean) => void
  comparisonColors$: ReadonlySignal<ReadonlyMap<string, string>>
  comparisonLoading$: ReadonlySignal<boolean>
}

const BUF_PRIMARY = 'main'
const BUF_COMPARISON = 'cmp'
const BUF_TIMESHARE = 'ts'

function bufKey(type: string, symbol: string, period?: string): string {
  if (type === BUF_TIMESHARE) return `ts:${symbol}`
  return `${type}:${symbol}:${period ?? 'daily'}`
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
  private _lastDataChange: DataChange | null = null

  private _batchScheduler = new FetchBatchScheduler()
  private _scrollCompensator: ScrollCompensator
  private _comparisonManager: ComparisonManager
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
      hasKLineBuffer: (key) => this._klineBuffers.has(key),
      getKLineBufferKeys: () => [...this._klineBuffers.keys()],
      scheduleDraw: () => this.deps.scheduleDraw(),
      setColors: (colors) => this.deps.setComparisonColors(colors),
      setLoading: (loading) => this.deps.setComparisonLoading(loading),
    })
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
      return
    }

    this._dataUnsub = buf.data.subscribe(() => {
      this.handleBufferDataEvent(key)
    })
    this._loadingUnsub = buf.loading.subscribe(() => {
      this.handleBufferLoadingEvent(key)
    })

    // 初始同步：key/data/loading 同批；subscribe 不回放当前值
    const { dataChanged, prependedCount, prevDataLength } = this.publishBufferSnapshot(
      key,
      buf,
      true,
    )
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
    this._dataUnsub = null
    this._loadingUnsub = null
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

  private getPrimaryDataBuffer(symbol: string, period: string): KLineBuffer {
    const key = bufKey(BUF_PRIMARY, symbol, period)
    let buf = this._klineBuffers.get(key)
    if (!buf) {
      buf = this._createKLineBuffer()
      buf.setFetcher(this._dataFetcher)
      if (this._dataFetcher) {
        buf.setRequestFetch(this._batchScheduler.createHandler())
      }
      this._klineBuffers.set(key, buf)
    } else {
      buf.setFetcher(this._dataFetcher)
      if (this._dataFetcher) {
        buf.setRequestFetch(this._batchScheduler.createHandler())
      }
    }
    return buf
  }

  private _createKLineBuffer(): KLineBuffer {
    return new DataBuffer()
  }

  private _createCmpBuffer(spec: SymbolSpec): { key: string; buffer: KLineBuffer } {
    const key = bufKey(BUF_COMPARISON, spec.symbol, spec.period)
    const buffer = this._createKLineBuffer()
    buffer.setFetcher(this._dataFetcher)
    if (this._dataFetcher) {
      buffer.setRequestFetch(this._batchScheduler.createHandler())
    }
    this._klineBuffers.set(key, buffer)
    return { key, buffer }
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

    if ((prevDataLength ?? this._dataState.readonly.dataLength.peek()) === 0 && bufferData.length > 0) {
      this.scrollToRight()
    }

    this.deps.resetInteraction()

    if (!this._dmState.readonly.rangeInitialized.peek() && bufferData.length > 0) {
      this._dmState.actions.setRangeInitialized(true)
    }

    let currentRange = this.deps.getVisibleRange()
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
    this._dmState.actions.recordIncrementalLoad(prependedCount, this.deps.getLeftLoadBufferWidth())
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
    return this.deps.getLeftLoadBufferWidth()
  }

  private getActiveKLineLength(): number {
    const buf = this.getActiveDataBuffer()
    return buf ? buf.getRawData().length : 0
  }

  /** 当前可见范围（on-demand 实时计算，消除 stale 缓存） */
  getCurrentVisibleRange(): VisibleRange | null {
    return this.deps.getVisibleRange()
  }

  /** Unified data signal — always reflects the active buffer's data */
  get data(): ReadonlySignal<ReadonlyArray<KLineData>> {
    return this._dataState.readonly.data as ReadonlySignal<ReadonlyArray<KLineData>>
  }

  /** Loading signal — mirrors the active buffer's loading state */
  get loading(): ReadonlySignal<boolean> {
    return this._dataState.readonly.loading
  }

  get symbols(): ReadonlySignal<ReadonlyArray<SymbolSpec>> {
    return this._dataState.readonly.symbols
  }

  get symbolCatalog(): ReadonlySignal<ReadonlyArray<SymbolInfo>> {
    return this._dataState.readonly.symbolCatalog
  }

  /**
   * Register symbols into the available catalog.
   * Deduplicates by symbol code: newer entries replace older ones.
   */
  registerSymbols(infos: ReadonlyArray<SymbolInfo>): void {
    const current = new Map(this._dataState.readonly.symbolCatalog.peek().map((s) => [s.symbol, s]))
    for (const info of infos) current.set(info.symbol, info)
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
    return this._comparisonManager.specs
  }

  get dataBuffer(): KLineBuffer {
    const buf = this.getActiveDataBuffer()
    if (buf) return buf
    const key = bufKey(BUF_PRIMARY, '', 'daily')
    let fallback = this._klineBuffers.get(key)
    if (!fallback) {
      fallback = this._createKLineBuffer()
      this._klineBuffers.set(key, fallback)
    }
    return fallback
  }

  get comparisonColors(): ReadonlySignal<ReadonlyMap<string, string>> {
    return this.deps.comparisonColors$
  }

  get comparisonLoading(): ReadonlySignal<boolean> {
    return this.deps.comparisonLoading$
  }

  getComparisonColors(): Map<string, string> {
    return this._comparisonManager.getColors()
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
    if (!fetcher) {
      for (const [, buf] of this._klineBuffers) {
        buf.setRequestFetch(null)
      }
      return
    }
    const handler = this._batchScheduler.createHandler()
    for (const [, buf] of this._klineBuffers) {
      buf.setRequestFetch(handler)
    }
  }

  checkVisibleRangeGap(): void {
    const buf = this.getActiveDataBuffer()
    if (!buf) return
    const data = buf.getRawData()
    if (data.length === 0) return
    const window = buf.loadedWindow
    if (!window) return
    const range = this.deps.getVisibleRange()
    if (!range) return

    const MS_PER_DAY = 86_400_000
    const spec = buf.currentSpec
    const gapDays = getPeriodDays(spec?.period)
    let firstVisibleTs: number | undefined

    if (range.start < 0 && this._dataFetcher) {
      const earlierThanEarliest = window.earliestTs - gapDays * MS_PER_DAY
      buf.ensureRange(earlierThanEarliest, window.earliestTs)
      firstVisibleTs = data[0]?.timestamp
    } else if (range.start < data.length) {
      firstVisibleTs = data[Math.max(0, range.start)]?.timestamp
      if (firstVisibleTs !== undefined && firstVisibleTs < window.earliestTs) {
        buf.ensureRange(firstVisibleTs, window.earliestTs)
      }
    }

    if (firstVisibleTs === undefined) return

    this._comparisonManager.ensureRange(firstVisibleTs, window.earliestTs)
  }

  // ── Comparison management ──

  private syncComparisonBuffers(specs: ReadonlyArray<SymbolSpec>): void {
    const primaryBuf = this.getActiveDataBuffer()
    this._comparisonManager.syncBuffers(specs, primaryBuf?.loadedWindow?.earliestTs)
  }

  private clearComparisonBuffers(): void {
    this._comparisonManager.clearAll()
  }

  addComparisonSymbol(spec: SymbolSpec): void {
    this._comparisonManager.addSymbol(spec, () => {
      const allSpecs = this._dataState.readonly.symbols.peek()
      this._dataState.actions.setSymbols([allSpecs[0]!, ...this._comparisonManager.specs])
    })
  }

  setComparisonData(symbol: string, data: KLineData[]): void {
    this._comparisonManager.setData(symbol, data, (key) => {
      this._dataState.actions.setSymbols([this._dataState.readonly.symbols.peek()[0]!, ...this._comparisonManager.specs])
    })
  }

  removeComparisonSymbol(symbol: string): void {
    if (!this._comparisonManager.removeSymbol(symbol)) return
    this._dataState.actions.setSymbols([this._dataState.readonly.symbols.peek()[0]!, ...this._comparisonManager.specs])
    this.deps.scheduleDraw()
  }

  // ── Symbol / Period ──

  setCurrentSymbol(symbol: string): void {
    const current = this._dmState.readonly.currentSpec.peek() ?? { symbol }
    this._dmState.actions.setCurrentSpec({ ...current, symbol })
    const specs = this._dataState.readonly.symbols.peek()
    if (specs.length > 0) {
      const updated = [{ ...specs[0], symbol }, ...specs.slice(1)] as SymbolSpec[]
      this._dataState.actions.setSymbols(updated)
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
      const vp = this.deps.getViewport()
      if (vp) {
        const opt = this.deps.getOption()
        const vRange = getVisibleRange(
          vp.scrollLeft,
          vp.plotWidth,
          opt.kWidth,
          opt.kGap,
          dataLen,
          vp.dpr,
        )
        visibleStart = vRange ? Math.max(0, vRange.start) : 0
      }
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
      tsBuf.setQueryDate(date)
      const spec = this._dmState.readonly.currentSpec.peek()
      if (spec) {
        const key = bufKey(BUF_TIMESHARE, spec.symbol)
        this._tsBuffers.set(key, tsBuf)
        this.activateBuffer(key)
        tsBuf.load(spec)
      }
    }
  }

  setCurrentPeriod(period: string): void {
    const current = this._dmState.readonly.currentSpec.peek()
    if (!current) {
      this._dmState.actions.setCurrentSpec({ symbol: '', period })
      return
    }
    const next = { ...current, period }
    this.setSymbols([next, ...this._comparisonManager.specs])
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
        ...(this._dmState.readonly.currentSpec.peek() ?? this._dataState.readonly.symbols.peek()[0] ?? { symbol: '' }),
      })
    }

    // 每次都切到 custom 品种，注册到目录，填入数据
    const spec: SymbolSpec = {
      symbol: source.symbol ?? '',
      period: ChartDataManager.normalizePeriod(source.period),
      incremental: false,
      source: source.source ?? 'custom',
    }
    this.setSymbols([spec, ...this._comparisonManager.specs])

    const symbolCode = spec.symbol
    if (symbolCode) {
      this.registerSymbols([
        {
          symbol: symbolCode,
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
    this.setSymbols([spec, ...this._comparisonManager.specs])
  }

  getPreCustomSpec(): SymbolSpec | null {
    return this._dmState.readonly.preCustomSpec.peek()
  }

  // ── Main symbol switching ──

  setSymbols(specs: ReadonlyArray<SymbolSpec>): void {
    this._dataState.actions.setSymbols(specs)

    if (specs.length === 0) {
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

    const primary = specs[0]!
    this._dmState.actions.setCurrentSpec(primary)

    if (primary.period === 'timeshare') {
      // Switch to timeshare mode
      this.clearComparisonBuffers()
      // Save scroll position before activating TS buffer (which clears _dataSignal).
      // Guarded by _savedScrollTimestamp === null so setTimeShareQueryDate (which
      // calls this method first) won't be overwritten.
      this._saveKLineScrollTimestamp()
      // Keep primary KLine buffer in memory — don't dispose it,
      // so data and scroll position are preserved when user returns
      this._dataState.actions.setData([])
      this._dmState.actions.setRangeInitialized(false)

      // Get or create timeshare buffer
      const tsKey = bufKey(BUF_TIMESHARE, primary.symbol)
      let tsBuf = this._tsBuffers.get(tsKey)
      if (!tsBuf) {
        tsBuf = new TimeShareBuffer()
        tsBuf.setFetcher(this._timeShareFetcher)
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

    this.loadKLineSymbols(specs)
  }

  // ── KLine loading ──

  private loadKLineSymbols(specs: ReadonlyArray<SymbolSpec>): void {
    const spec = specs[0]!
    this.syncComparisonBuffers(specs.slice(1))

    const buf = this.getPrimaryDataBuffer(spec.symbol, spec.period!)
    this.activateBuffer(bufKey(BUF_PRIMARY, spec.symbol, spec.period!))
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
    const idx = raw.findIndex((d) => d.timestamp >= this._dmState.readonly.savedScrollTimestamp.peek()!)
    this._dmState.actions.setSavedScrollTimestamp(null)
    if (idx >= 0) {
      const dpr = this.deps.getEffectiveDpr()
      const opt = this.deps.getOption()
      const { unitPx, startXPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)
      const leftBuffer = this.getLeftLoadBufferWidth()
      const scrollLeft = ((idx + 1) * unitPx + startXPx) / dpr + leftBuffer
      this.deps.setScrollLeft(scrollLeft)
      return true
    }
    return false
  }

  // ── Content width ──

  getContentWidth(): number {
    return this.deps.getContentWidth()
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
    const vp = this.deps.getViewport()
    if (!vp) return null
    const buf = this.getActiveDataBuffer()
    const data = buf ? buf.getRawData() : []
    if (data.length === 0) return null
    const dpr = this.deps.getEffectiveDpr()
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
