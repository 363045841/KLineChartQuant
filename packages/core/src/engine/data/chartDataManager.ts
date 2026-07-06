import type { SymbolSpec, SymbolInfo, DataFetcher, CustomDataSource } from '../../controllers/types'
import { DataBuffer } from '../../data-fetchers/dataBuffer'
import { getPeriodDays } from '../../data-fetchers/dataBuffer.effects'
import type { KLineBuffer, DataChange } from '../../data-fetchers/dataBufferTypes'
import { TimeShareBuffer } from '../../data-fetchers/timeShareBuffer'
import type { TimeShareFetcherFn } from '../../data-fetchers/types'
import { batch, createSignal, type Signal } from '../../reactivity/signal'
import type { KLineData, TimeShareData } from '../../types/price'
import type { ChartDom, Viewport } from '../chartTypes'
import type { VisibleRange, UpdateLevel } from '../layout/pane'
import { getPhysicalKLineConfig } from '../utils/klineConfig'
import { getVisibleRange } from '../viewport/viewport'

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
  scheduleDraw: (level?: UpdateLevel) => void
  resetInteraction: () => void
  getIndicatorScheduler: () => {
    update: (data: KLineData[], range: VisibleRange) => boolean
    busySignal: Signal<boolean>
  }
  isPointerDown: () => boolean
  onTimeShareDataReady: (dataLength: number) => void
  onDataProcessed?: (data: KLineData[], range: VisibleRange) => void
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
  private _activeBufferKey: string | null = null
  private _activeBufferUnsub: (() => void) | null = null

  private _dataSignal = createSignal<ReadonlyArray<unknown>>([])
  private _loadingSignal = createSignal<boolean>(false)
  private _symbolsSignal = createSignal<ReadonlyArray<SymbolSpec>>([])
  /** Available symbol catalog — consumed by UI pickers (e.g. TopToolbar) */
  private _symbolCatalog = createSignal<ReadonlyArray<SymbolInfo>>([])

  private _currentSpec: SymbolSpec | null = null

  private _batchScheduler = new FetchBatchScheduler()
  private _scrollCompensator: ScrollCompensator
  private _comparisonManager: ComparisonManager
  private _loadHint: IncrementalLoadHint

  /** 进入分时图时第一根可见 K 线的时间戳，退出分时图后根据此时间戳恢复滚动位置 */
  private _savedScrollTimestamp: number | null = null
  private _preCustomSpec: SymbolSpec | null = null

  private _rangeInitialized = false

  private deps: DataDependencies

  constructor(deps: DataDependencies) {
    this.deps = deps
    this._scrollCompensator = new ScrollCompensator(deps)
    this._loadHint = new IncrementalLoadHint(deps)
    this._comparisonManager = new ComparisonManager({
      createComparisonBuffer: (spec) => this._createCmpBuffer(spec),
      disposeBuffer: (key) => this.disposeBuffer(key),
      getKLineBuffer: (key) => this._klineBuffers.get(key),
      hasKLineBuffer: (key) => this._klineBuffers.has(key),
      getKLineBufferKeys: () => [...this._klineBuffers.keys()],
      scheduleDraw: () => this.deps.scheduleDraw(),
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
    if (this._activeBufferKey === key) return
    this._activeBufferUnsub?.()
    this._activeBufferKey = key
    const buf = this._lookupBuffer(key)
    if (buf) {
      this._dataSignal.set([...(buf.data.peek() as DataChange).data as unknown[]])
      this._loadingSignal.set(buf.loading.peek())
      const unsubData = buf.data.subscribe(() => {
        const change = buf.data.peek() as DataChange
        const prevDataLength = this._dataSignal.peek().length
        batch(() => {
          this._dataSignal.set([...(change.data as unknown[])])
          this.onBufferDataChanged(key, prevDataLength, change.prependedCount)
        })
      })
      const unsubLoading = buf.loading.subscribe(() => {
        this._loadingSignal.set(buf.loading.peek())
      })
      this._activeBufferUnsub = () => {
        unsubData()
        unsubLoading()
      }
    } else {
      this._dataSignal.set([])
      this._loadingSignal.set(false)
      this._activeBufferUnsub = null
    }
  }

  private disposeBuffer(key: string): void {
    const buf = this._lookupBuffer(key)
    if (!buf) return
    buf.dispose()
    if (key.startsWith(BUF_TIMESHARE)) this._tsBuffers.delete(key)
    else this._klineBuffers.delete(key)
  }

  private getActiveDataBuffer(): KLineBuffer | null {
    return this._activeBufferKey && !this._activeBufferKey.startsWith(BUF_TIMESHARE)
      ? (this._klineBuffers.get(this._activeBufferKey) ?? null)
      : null
  }

  private getActiveTimeShareBuffer(): TimeShareBuffer | null {
    return this._activeBufferKey?.startsWith(BUF_TIMESHARE) === true
      ? (this._tsBuffers.get(this._activeBufferKey) ?? null)
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

    if ((prevDataLength ?? this._dataSignal.peek().length) === 0 && bufferData.length > 0) {
      this.scrollToRight()
    }

    this.deps.resetInteraction()

    if (!this._rangeInitialized && bufferData.length > 0) {
      this._rangeInitialized = true
    }

    let currentRange = this.computeRawVisibleRange()
    if (!currentRange && this._rangeInitialized && bufferData.length > 0) {
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

    this._loadHint.show(prependedCount, this.getLeftLoadBufferWidth())

    if (prependedCount > 0) {
      this.checkVisibleRangeGap()
    }
  }

  private onTimeShareBufferChanged(): void {
    const data = this._dataSignal.peek() as TimeShareData[]
    this._rangeInitialized = true
    this.deps.resetInteraction()
    this.deps.onTimeShareDataReady(data.length)
  }

  // ── Internal helpers ──

  getLeftLoadBufferWidth(): number {
    const buf = this.getActiveDataBuffer()
    const dataLength = buf ? buf.getRawData().length : 0
    return this._scrollCompensator.getLeftLoadBufferWidth(dataLength)
  }

  private getActiveKLineLength(): number {
    const buf = this.getActiveDataBuffer()
    return buf ? buf.getRawData().length : 0
  }

  private computeRawVisibleRange(): VisibleRange | null {
    const buf = this.getActiveDataBuffer()
    const dataLength = buf ? buf.getRawData().length : 0
    if (dataLength === 0) return null
    const vp = this.deps.getViewport()
    if (!vp) return null
    const opt = this.deps.getOption()
    return getVisibleRange(vp.scrollLeft, vp.plotWidth, opt.kWidth, opt.kGap, dataLength, vp.dpr)
  }

  /** 当前可见范围（on-demand 实时计算，消除 stale 缓存） */
  getCurrentVisibleRange(): VisibleRange | null {
    return this.computeRawVisibleRange()
  }

  /** Unified data signal — always reflects the active buffer's data */
  get data(): Signal<ReadonlyArray<KLineData>> {
    return this._dataSignal as Signal<ReadonlyArray<KLineData>>
  }

  /** Loading signal — mirrors the active buffer's loading state */
  get loading(): Signal<boolean> {
    return this._loadingSignal
  }

  get symbols(): Signal<ReadonlyArray<SymbolSpec>> {
    return this._symbolsSignal
  }

  get symbolCatalog(): Signal<ReadonlyArray<SymbolInfo>> {
    return this._symbolCatalog
  }

  /**
   * Register symbols into the available catalog.
   * Deduplicates by symbol code: newer entries replace older ones.
   */
  registerSymbols(infos: ReadonlyArray<SymbolInfo>): void {
    const current = new Map(this._symbolCatalog.peek().map((s) => [s.code, s]))
    for (const info of infos) current.set(info.code, info)
    this._symbolCatalog.set([...current.values()])
  }

  /** Remove a symbol from the catalog by code. */
  unregisterSymbol(code: string): void {
    const next = this._symbolCatalog.peek().filter((s) => s.code !== code)
    if (next.length < this._symbolCatalog.peek().length) {
      this._symbolCatalog.set(next)
    }
  }

  get currentPeriod(): string {
    return this._currentSpec?.period ?? 'daily'
  }

  /** Internal KLine data for indicator scheduler (empty in timeshare mode) */
  getInternalData(): KLineData[] {
    const buf = this.getActiveDataBuffer()
    if (buf) return buf.getRawData()
    const peek = this._dataSignal.peek()
    return peek.length > 0 ? (peek as KLineData[]) : []
  }

  getRenderData(): unknown[] {
    return [...this._dataSignal.peek()]
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

  getTimeShareSignal(): Signal<ReadonlyArray<TimeShareData>> {
    const buf = this.getActiveTimeShareBuffer()
    return (buf?.data ?? createSignal<ReadonlyArray<TimeShareData>>([])) as Signal<
      ReadonlyArray<TimeShareData>
    >
  }

  getTimeShareLoadingSignal(): Signal<boolean> {
    const buf = this.getActiveTimeShareBuffer()
    return (buf?.loading ?? createSignal<boolean>(false)) as Signal<boolean>
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

  get comparisonColors(): Signal<ReadonlyMap<string, string>> {
    return this._comparisonManager.colorsSignal
  }

  get comparisonLoading(): Signal<boolean> {
    return this._comparisonManager.loadingSignal
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
      this._dataSignal.set([...data])
    }
  }

  appendData(newData: KLineData[]): void {
    const buf = this.getActiveDataBuffer()
    if (buf) {
      const merged = [...buf.getRawData(), ...newData]
      buf.setInlineData(merged)
    } else {
      this._dataSignal.set([...this._dataSignal.peek(), ...newData])
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
    const range = this.computeRawVisibleRange()
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
      const allSpecs = this._symbolsSignal.peek()
      this._symbolsSignal.set([allSpecs[0]!, ...this._comparisonManager.specs])
    })
  }

  setComparisonData(symbol: string, data: KLineData[]): void {
    this._comparisonManager.setData(symbol, data, (key) => {
      this._symbolsSignal.set([
        this._symbolsSignal.peek()[0]!,
        ...this._comparisonManager.specs,
      ])
    })
  }

  removeComparisonSymbol(symbol: string): void {
    if (!this._comparisonManager.removeSymbol(symbol)) return
    this._symbolsSignal.set([this._symbolsSignal.peek()[0]!, ...this._comparisonManager.specs])
    this.deps.scheduleDraw()
  }

  // ── Symbol / Period ──

  setCurrentSymbol(symbol: string): void {
    const current = this._currentSpec ?? { symbol }
    this._currentSpec = { ...current, symbol }
    const specs = this._symbolsSignal.peek()
    if (specs.length > 0) {
      const updated = [{ ...specs[0], symbol }, ...specs.slice(1)] as SymbolSpec[]
      this._symbolsSignal.set(updated)
    }
  }

  setTimeShareQueryDate(date: number): void {
    const buf = this.getActiveTimeShareBuffer()
    if (buf) {
      buf.setQueryDate(date)
    } else {
      // Store for later when buffer is created
      const tsBuf = new TimeShareBuffer()
      tsBuf.setFetcher(this._timeShareFetcher)
      tsBuf.setQueryDate(date)
      const spec = this._currentSpec
      if (spec) {
        const key = bufKey(BUF_TIMESHARE, spec.symbol)
        this._tsBuffers.set(key, tsBuf)
        this.activateBuffer(key)
        tsBuf.load(spec)
      }
    }
  }

  setCurrentPeriod(period: string): void {
    const current = this._currentSpec
    if (!current) {
      this._currentSpec = { symbol: '', period }
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
    if (!this._preCustomSpec) {
      this._preCustomSpec = { ...(this._currentSpec ?? this._symbolsSignal.peek()[0] ?? { symbol: '' }) }
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
          code: symbolCode,
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
    if (this._activeBufferKey && !this._activeBufferKey.startsWith(BUF_TIMESHARE)) {
      this.disposeBuffer(this._activeBufferKey)
    }
    this._dataSignal.set([])
    this._rangeInitialized = false
    this._savedScrollTimestamp = null
    this.setSymbols([spec, ...this._comparisonManager.specs])
  }

  getPreCustomSpec(): SymbolSpec | null {
    return this._preCustomSpec
  }

  // ── Main symbol switching ──

  setSymbols(specs: ReadonlyArray<SymbolSpec>): void {
    this._symbolsSignal.set(specs)

    if (specs.length === 0) {
      this._currentSpec = null
      this.disposeAllBuffers()
      this._dataSignal.set([])
      this._rangeInitialized = false
      return
    }

    const primary = specs[0]!
    this._currentSpec = primary

    if (primary.period === 'timeshare') {
      // Switch to timeshare mode
      this.clearComparisonBuffers()
      // Save the timestamp of the first visible K-line so we can restore
      // scroll position when returning to K-line mode, immune to data prepends.
      const kBuf = this.getActiveDataBuffer()
      const rawFromBuf = kBuf?.getRawData() as KLineData[] | undefined
      // If no KLine buffer is active (e.g. semantic config applied data without
      // activating a dedicated buffer), fall back to the data signal which
      // always reflects the currently displayed KLine data.
      const kRaw = rawFromBuf ?? (this._dataSignal.peek() as KLineData[])
      const dataLen = kRaw?.length ?? 0
      let visibleStart = 0
      if (dataLen > 0) {
        const vp = this.deps.getViewport()
        if (vp) {
          const opt = this.deps.getOption()
          const vRange = getVisibleRange(vp.scrollLeft, vp.plotWidth, opt.kWidth, opt.kGap, dataLen, vp.dpr)
          visibleStart = vRange ? Math.max(0, vRange.start) : 0
        }
      }
      this._savedScrollTimestamp =
        kRaw && visibleStart >= 0 && visibleStart < kRaw.length
          ? kRaw[visibleStart]!.timestamp
          : null
      // Keep primary KLine buffer in memory — don't dispose it,
      // so data and scroll position are preserved when user returns
      this._dataSignal.set([])
      this._rangeInitialized = false

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
      if (this._savedScrollTimestamp !== null) {
        const raw = buf.getRawData() as KLineData[]
        const idx = raw.findIndex((d) => d.timestamp >= this._savedScrollTimestamp!)
        this._savedScrollTimestamp = null
        if (idx >= 0) {
          const dpr = this.deps.getEffectiveDpr()
          const opt = this.deps.getOption()
          const { unitPx, startXPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)
          const leftBuffer = this.getLeftLoadBufferWidth()
          const scrollLeft = ((idx + 1) * unitPx + startXPx) / dpr + leftBuffer
          this.deps.setScrollLeft(scrollLeft)
        } else {
          this.scrollToRight()
        }
      } else {
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

  // ── Content width ──

  getContentWidth(): number {
    if (this.currentPeriod === 'timeshare') {
      const tsData = this.getTimeShareData()
      if (tsData.length === 0) return 0
      const viewWidth = this.deps.getViewport()?.plotWidth ?? 0
      return this.getLeftLoadBufferWidth() + Math.max(viewWidth, 1)
    }
    const buf = this.getActiveDataBuffer()
    const dataLength = buf ? buf.getRawData().length : 0
    if (dataLength === 0) return 0
    return this._scrollCompensator.getContentWidth(dataLength)
  }

  scrollToRight(): void {
    const buf = this.getActiveDataBuffer()
    const dataLength = buf ? buf.getRawData().length : 0
    this._scrollCompensator.scrollToRight(dataLength)
    this.deps.scheduleDraw()
  }

  // ── Comparison price range ──

  getComparisonEquivalentPriceRange(range: VisibleRange): { min: number; max: number } | null {
    if (this._comparisonManager.specs.length === 0 || this._comparisonManager.data.size === 0) return null
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
    this._activeBufferUnsub?.()
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
