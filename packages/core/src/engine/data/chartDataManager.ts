import type { KLineData, TimeShareData } from '../../types/price'
import type { SymbolSpec, DataFetcher, CustomDataSource } from '../../controllers/types'
import { createSignal, type Signal } from '../../reactivity/signal'
import { DataBuffer, getPeriodDays } from '../../data-fetchers/dataBuffer'
import { TimeShareBuffer } from '../../data-fetchers/timeShareBuffer'
import type { DataBufferLike } from '../../data-fetchers/dataBufferTypes'
import type { TimeShareFetcherFn } from '../../data-fetchers/types'
import type { ChartDom, Viewport } from '../chartTypes'
import type { VisibleRange, UpdateLevel } from '../layout/pane'
import { getVisibleRange } from '../viewport/viewport'
import { getPhysicalKLineConfig } from '../utils/klineConfig'

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
  }
  setPendingIndicatorDataUpdate: (v: boolean) => void
  isPointerDown: () => boolean
  onTimeShareDataReady: (dataLength: number) => void
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

  private _buffers = new Map<string, any>()
  private _activeBufferKey: string | null = null
  private _activeBufferUnsub: (() => void) | null = null

private _dataSignal = createSignal<ReadonlyArray<unknown>>([])
private _loadingSignal = createSignal<boolean>(false)
private _symbolsSignal = createSignal<ReadonlyArray<SymbolSpec>>([])

  private _currentSpec: SymbolSpec | null = null

  // Comparison-specific state (still needed for rendering pass-through)
  private _comparisonSpecs: SymbolSpec[] = []
  private _comparisonData: Map<string, KLineData[]> = new Map()
  private _comparisonColors: Map<string, string> = new Map()
  private _comparisonColorsSignal = createSignal<ReadonlyMap<string, string>>(new Map())
  private _comparisonLoadingSignal = createSignal<boolean>(false)
  // Track loading per-comparison buffer (keyed by buffer key)
  private _cmpLoadingUnsubs = new Map<string, () => void>()

  private _pendingFetches: Array<{
    source: string
    spec: SymbolSpec
    startTs: number
    endTs: number
    resolve: (data: ReadonlyArray<KLineData>) => void
    reject: (err: Error) => void
  }> = []

  private _batchFlushScheduled = false

  private incrementalLoadHintEl: HTMLDivElement | null = null
  private incrementalLoadHintTimer: number | null = null
  private pendingPrependedCount = 0

  lastVisibleRange: VisibleRange = { start: 0, end: 0 }
  lastRawVisibleRange: VisibleRange = { start: 0, end: 0 }
  pendingIndicatorDataUpdate = false

  private deps: DataDependencies

  constructor(deps: DataDependencies) {
    this.deps = deps
  }

  // ── Buffer helpers ──

  private activateBuffer(key: string): void {
    if (this._activeBufferKey === key) return
    this._activeBufferUnsub?.()
    this._activeBufferKey = key
    const buf = this._buffers.get(key) as DataBufferLike | undefined
    if (buf) {
      this._dataSignal.set([...buf.data.peek() as unknown[]])
      this._loadingSignal.set(buf.loading.peek())
      const unsubData = buf.data.subscribe(() => {
        const prevDataLength = this._dataSignal.peek().length
        this._dataSignal.set([...buf.data.peek() as unknown[]])
        this.onBufferDataChanged(key, prevDataLength)
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
    const buf = this._buffers.get(key)
    if (!buf) return
    const unsub = this._cmpLoadingUnsubs.get(key)
    unsub?.()
    const loadingUnsub = this._cmpLoadingUnsubs.get(`loading:${key}`)
    loadingUnsub?.()
    this._cmpLoadingUnsubs.delete(key)
    this._cmpLoadingUnsubs.delete(`loading:${key}`)
    buf.dispose()
    this._buffers.delete(key)
  }

  private getActiveDataBuffer(): DataBuffer | null {
    const buf = this._activeBufferKey ? this._buffers.get(this._activeBufferKey) : null
    return buf instanceof DataBuffer ? buf : null
  }

  private getActiveTimeShareBuffer(): TimeShareBuffer | null {
    const buf = this._activeBufferKey ? this._buffers.get(this._activeBufferKey) : null
    return buf instanceof TimeShareBuffer ? buf : null
  }

  private getPrimaryDataBuffer(symbol: string, period: string): DataBuffer {
    const key = bufKey(BUF_PRIMARY, symbol, period)
    let buf = this._buffers.get(key) as DataBuffer | undefined
    if (!buf) {
      buf = new DataBuffer()
      buf.setFetcher(this._dataFetcher)
      if (this._dataFetcher) {
        buf.setRequestFetch(this._createBatchHandler(this._dataFetcher))
      }
      this._buffers.set(key, buf)
    } else {
      buf.setFetcher(this._dataFetcher)
      if (this._dataFetcher) {
        buf.setRequestFetch(this._createBatchHandler(this._dataFetcher))
      }
    }
    return buf
  }

  // ── Buffer data change handler ──

  private onBufferDataChanged(key: string, prevDataLength?: number): void {
    const buf = this._buffers.get(key)
    if (!buf) return

    if (buf instanceof DataBuffer) {
      this.onKLineBufferChanged(key, buf, prevDataLength)
    } else if (buf instanceof TimeShareBuffer) {
      this.onTimeShareBufferChanged(key, buf)
    }
  }

  private onKLineBufferChanged(key: string, buf: DataBuffer, prevDataLength?: number): void {
    if (!key.startsWith('main:')) return

    const bufferData = buf.getRawData() as KLineData[]
    const prependedCount = this.pendingPrependedCount
    this.pendingPrependedCount = 0

    if (prependedCount === 0 && this.deps.getCachedScrollLeft() < this.getLeftLoadBufferWidth()) {
      this.deps.setScrollLeft(this.getLeftLoadBufferWidth())
    }

    if ((prevDataLength ?? this._dataSignal.peek().length) === 0 && bufferData.length > 0) {
      this.scrollToRight()
    }

    this.deps.resetInteraction()

    if (this.lastVisibleRange.start === 0 && this.lastVisibleRange.end === 0 && bufferData.length > 0) {
      const plotWidth = this.deps.getObservedSize().width > 0
        ? this.deps.getObservedSize().width
        : Math.max(1, Math.round(this.deps.getDom().container?.clientWidth ?? 800))
      const dpr = this.deps.getEffectiveDpr()
      const opt = this.deps.getOption()
      const { start, end } = getVisibleRange(
        this.deps.getLogicalScrollLeft(),
        plotWidth,
        opt.kWidth,
        opt.kGap,
        bufferData.length,
        dpr,
      )
      this.lastRawVisibleRange = { start, end }
      this.lastVisibleRange = { start: Math.max(0, start), end }
    }

    const scheduler = this.deps.getIndicatorScheduler()
    const indicatorsReady = scheduler.update(bufferData, this.lastVisibleRange)
    if (indicatorsReady) {
      this.pendingIndicatorDataUpdate = false
      this.deps.scheduleDraw()
    } else {
      this.pendingIndicatorDataUpdate = true
    }

    this.showIncrementalLoadHint(prependedCount)
  }

  private onTimeShareBufferChanged(_key: string, _buf: TimeShareBuffer): void {
    const data = this._dataSignal.peek() as TimeShareData[]
    this.lastVisibleRange = { start: 0, end: data.length }
    this.lastRawVisibleRange = { start: 0, end: data.length }
    this.deps.resetInteraction()
    this.deps.onTimeShareDataReady(data.length)
  }

  // ── Internal helpers ──

  private getScrollContentHost(): HTMLDivElement | null {
    return this.deps.getDom().scrollContent ?? this.deps.getDom().container ?? null
  }

  getLeftLoadBufferWidth(): number {
    const buf = this.getActiveDataBuffer()
    const dataLength = buf ? buf.getRawData().length : 0
    if (dataLength === 0) return 0
    const plotWidth = this.deps.getViewport()?.plotWidth
      ?? (this.deps.getObservedSize().width > 0 ? this.deps.getObservedSize().width : undefined)
      ?? Math.round(this.deps.getDom().container?.clientWidth ?? 0)
    return Math.max(0, plotWidth)
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
    return getVisibleRange(
      vp.scrollLeft,
      vp.plotWidth,
      opt.kWidth,
      opt.kGap,
      dataLength,
      vp.dpr,
    )
  }

  private getTrailingSlotCount(): number {
    return 24
  }



  private clearIncrementalLoadHintTimer(): void {
    if (this.incrementalLoadHintTimer !== null) {
      window.clearTimeout(this.incrementalLoadHintTimer)
      this.incrementalLoadHintTimer = null
    }
  }

  private hideIncrementalLoadHint(): void {
    const hint = this.incrementalLoadHintEl
    if (!hint) return
    hint.style.opacity = '0'
    hint.style.filter = 'blur(10px)'
  }

  private ensureIncrementalLoadHint(): HTMLDivElement | null {
    const host = this.getScrollContentHost()
    if (!host) return null
    if (this.incrementalLoadHintEl && this.incrementalLoadHintEl.isConnected) {
      return this.incrementalLoadHintEl
    }
    const ownerDoc = host.ownerDocument
    if (!ownerDoc) return null
    const hint = ownerDoc.createElement('div')
    hint.className = 'klc-incremental-load-hint'
    hint.style.position = 'absolute'
    hint.style.top = '0'
    hint.style.height = '0px'
    hint.style.width = '0px'
    hint.style.pointerEvents = 'none'
    hint.style.opacity = '0'
    hint.style.filter = 'blur(10px)'
    hint.style.transition = 'opacity 420ms ease, filter 420ms ease'
    hint.style.background = 'rgba(71, 91, 132, 0.5)'
    hint.style.zIndex = '3'
    hint.style.willChange = 'opacity, filter, width'
    host.appendChild(hint)
    this.incrementalLoadHintEl = hint
    return hint
  }

  private showIncrementalLoadHint(count: number): void {
    if (count <= 0) return
    const hint = this.ensureIncrementalLoadHint()
    if (!hint) return
    this.clearIncrementalLoadHintTimer()
    const dpr = this.deps.getEffectiveDpr()
    const opt = this.deps.getOption()
    const { unitPx, startXPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)
    hint.style.left = `${this.getLeftLoadBufferWidth()}px`
    const width = (startXPx + count * unitPx) / dpr
    hint.style.width = `${Math.max(0, width)}px`
    hint.style.height = `${Math.max(
      0,
      this.deps.getViewport()?.viewHeight ?? this.deps.getDom().container?.clientHeight ?? 0,
    )}px`
    hint.getBoundingClientRect()
    hint.style.opacity = '1'
    hint.style.filter = 'blur(0px)'
    this.incrementalLoadHintTimer = window.setTimeout(() => {
      this.hideIncrementalLoadHint()
      this.incrementalLoadHintTimer = null
    }, 900)
  }

  // ── Public accessors ──

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

  get currentPeriod(): string {
    return this._currentSpec?.period ?? 'daily'
  }

  /** Internal KLine data for indicator scheduler (empty in timeshare mode) */
  getInternalData(): KLineData[] {
    const buf = this.getActiveDataBuffer()
    return buf ? buf.getRawData() : []
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
    return (buf?.data ?? createSignal<ReadonlyArray<TimeShareData>>([])) as Signal<ReadonlyArray<TimeShareData>>
  }

  getTimeShareLoadingSignal(): Signal<boolean> {
    const buf = this.getActiveTimeShareBuffer()
    return (buf?.loading ?? createSignal<boolean>(false)) as Signal<boolean>
  }

  setTimeShareFetcher(fetcher: TimeShareFetcherFn | null): void {
    this._timeShareFetcher = fetcher
  }

  getComparisonData(): Map<string, KLineData[]> {
    return this._comparisonData
  }

  getComparisonSpecs(): SymbolSpec[] {
    return this._comparisonSpecs
  }

  get dataBuffer(): DataBuffer {
    const buf = this.getActiveDataBuffer()
    if (buf) return buf
    // Fallback: create a primary buffer if none exists yet
    const key = bufKey(BUF_PRIMARY, '', 'daily')
    let fallback = this._buffers.get(key) as DataBuffer | undefined
    if (!fallback) {
      fallback = new DataBuffer()
      this._buffers.set(key, fallback)
    }
    return fallback
  }

  get comparisonColors(): Signal<ReadonlyMap<string, string>> {
    return this._comparisonColorsSignal
  }

  get comparisonLoading(): Signal<boolean> {
    return this._comparisonLoadingSignal
  }

  getComparisonColors(): Map<string, string> {
    return this._comparisonColors
  }

  private recomputeComparisonLoading(): void {
    const anyLoading = Array.from(this._buffers.entries()).some(
      ([k, b]) => k.startsWith(BUF_COMPARISON) && b instanceof DataBuffer && b.loading.peek(),
    )
    this._comparisonLoadingSignal.set(anyLoading)
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
    if (!fetcher) {
      for (const [key, buf] of this._buffers) {
        if (buf instanceof DataBuffer) {
          const dataBuf = buf as DataBuffer
          dataBuf.setRequestFetch(null)
        }
      }
      return
    }
    const handler = this._createBatchHandler(fetcher)
    for (const [key, buf] of this._buffers) {
      if (buf instanceof DataBuffer) {
        const dataBuf = buf as DataBuffer
        dataBuf.setRequestFetch(handler)
      }
    }
  }

  private _createBatchHandler(
    fetcher: DataFetcher,
  ): (spec: SymbolSpec, startTs: number, endTs: number) => Promise<ReadonlyArray<KLineData>> {
    return (spec, startTs, endTs) =>
      new Promise<ReadonlyArray<KLineData>>((resolve, reject) => {
        this._pendingFetches.push({
          source: spec.source ?? 'baostock',
          spec,
          startTs,
          endTs,
          resolve,
          reject,
        })
        this._scheduleBatchFlush()
      })
  }

  private _scheduleBatchFlush(): void {
    if (this._batchFlushScheduled) return
    this._batchFlushScheduled = true
    Promise.resolve().then(() => this._flushBatch())
  }

  private async _flushBatch(): Promise<void> {
    this._batchFlushScheduled = false
    const batch = this._pendingFetches.splice(0)
    if (batch.length === 0 || !this._dataFetcher) return
    const fetcher = this._dataFetcher
    const CONCURRENCY = 4
    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      const chunk = batch.slice(i, i + CONCURRENCY)
      await Promise.allSettled(
        chunk.map(({ source, spec, startTs, endTs, resolve, reject }) =>
          fetcher(source, {
            symbol: spec.symbol,
            startDate: batchFormatDate(startTs),
            endDate: batchFormatDate(endTs),
            period: spec.period ?? 'daily',
            adjust: spec.adjust ?? 'none',
            exchange: spec.exchange,
          }).then(resolve, reject),
        ),
      )
    }
  }

  checkVisibleRangeGap(): void {
    const buf = this.getActiveDataBuffer()
    if (!buf) return
    const data = buf.getRawData()
    if (data.length === 0) return
    const window = buf.loadedWindow
    if (!window) return
    const range = this.computeRawVisibleRange() ?? this.lastRawVisibleRange

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

    for (const [key, b] of this._buffers) {
      if (key.startsWith(BUF_COMPARISON) && b instanceof DataBuffer) {
        b.ensureRange(firstVisibleTs, window.earliestTs)
      }
    }
  }

  // ── Comparison management ──

  private syncComparisonBuffers(specs: ReadonlyArray<SymbolSpec>): void {
    this._comparisonSpecs = [...specs]
    const nextKeys = new Set(specs.map((spec) => spec.symbol))

    // Remove buffers for removed comparisons
    for (const [key, buf] of this._buffers) {
      if (!key.startsWith(BUF_COMPARISON)) continue
      const symbol = key.split(':')[1]!
      if (nextKeys.has(symbol)) continue
      this.disposeBuffer(key)
      this._comparisonData.delete(symbol)
    }

    if (!this._dataFetcher) return

    const primaryBuf = this.getActiveDataBuffer()

    for (const spec of specs) {
      const key = bufKey(BUF_COMPARISON, spec.symbol, spec.period)
      const symbol = spec.symbol
      let buf = this._buffers.get(key) as DataBuffer | undefined
      if (!buf) {
        const newBuffer = new DataBuffer()
        newBuffer.setFetcher(this._dataFetcher)
        if (this._dataFetcher) {
          newBuffer.setRequestFetch(this._createBatchHandler(this._dataFetcher))
        }
        this._buffers.set(key, newBuffer)

        const unsubscribe = newBuffer.data.subscribe(() => {
          this._comparisonData.set(symbol, [...newBuffer.getRawData()])
          this.deps.scheduleDraw()
        })
        this._cmpLoadingUnsubs.set(key, unsubscribe)

        const unsubLoading = newBuffer.loading.subscribe(() => this.recomputeComparisonLoading())
        // Store loading unsubscribe with a special key
        this._cmpLoadingUnsubs.set(`loading:${key}`, unsubLoading)

        buf = newBuffer
      } else {
        buf.setFetcher(this._dataFetcher)
        if (this._dataFetcher) {
          buf.setRequestFetch(this._createBatchHandler(this._dataFetcher))
        }
      }
      const mainEarliest = primaryBuf?.loadedWindow?.earliestTs
      buf.setSymbol(spec, mainEarliest)
    }
  }

  private clearComparisonBuffers(): void {
    for (const [key, buf] of this._buffers) {
      if (key.startsWith(BUF_COMPARISON)) {
        this.disposeBuffer(key)
      }
    }
    this._comparisonData.clear()
    this._comparisonColors.clear()
    this._comparisonColorsSignal.set(new Map())
    this._comparisonLoadingSignal.set(false)
    this._comparisonSpecs = []
  }

  addComparisonSymbol(spec: SymbolSpec): void {
    const symbol = spec.symbol
    const key = bufKey(BUF_COMPARISON, symbol, spec.period)

    // Check if already exists
    for (const k of this._buffers.keys()) {
      if (k.startsWith(BUF_COMPARISON) && k.split(':')[1] === symbol) return
    }

    this._comparisonSpecs.push(spec)

    const color = COMPARISON_PALETTE[this._comparisonColors.size % COMPARISON_PALETTE.length] ?? DEFAULT_COMPARISON_COLOR
    this._comparisonColors.set(symbol, color)
    this._comparisonColorsSignal.set(new Map(this._comparisonColors))

    if (!this._dataFetcher) return

    const newBuffer = new DataBuffer()
    newBuffer.setFetcher(this._dataFetcher)
    if (this._dataFetcher) {
      newBuffer.setRequestFetch(this._createBatchHandler(this._dataFetcher))
    }
    this._buffers.set(key, newBuffer)
    const unsubscribe = newBuffer.data.subscribe(() => {
      this._comparisonData.set(symbol, [...newBuffer.getRawData()])
      this.deps.scheduleDraw()
    })
    this._cmpLoadingUnsubs.set(key, unsubscribe)
    const unsubLoading = newBuffer.loading.subscribe(() => this.recomputeComparisonLoading())
    this._cmpLoadingUnsubs.set(`loading:${key}`, unsubLoading)
    const primaryBuf = this.getActiveDataBuffer()
    const mainEarliest = primaryBuf?.loadedWindow?.earliestTs
    newBuffer.setSymbol(spec, mainEarliest)
    this._symbolsSignal.set([this._symbolsSignal.peek()[0]!, ...this._comparisonSpecs])
  }

  setComparisonData(symbol: string, data: KLineData[]): void {
    const period = this.currentPeriod
    const key = bufKey(BUF_COMPARISON, symbol, period)

    const existing = this._buffers.get(key) as DataBuffer | undefined
    if (!existing) {
      const buffer = new DataBuffer()
      this._buffers.set(key, buffer)

      const unsub = buffer.data.subscribe(() => {
        this._comparisonData.set(symbol, [...buffer.getRawData()])
        this.deps.scheduleDraw()
      })
      this._cmpLoadingUnsubs.set(key, unsub)

      const unsubLoading = buffer.loading.subscribe(() => this.recomputeComparisonLoading())
      this._cmpLoadingUnsubs.set(`loading:${key}`, unsubLoading)

      const color =
        COMPARISON_PALETTE[this._comparisonColors.size % COMPARISON_PALETTE.length] ??
        DEFAULT_COMPARISON_COLOR
      this._comparisonColors.set(symbol, color)
      this._comparisonColorsSignal.set(new Map(this._comparisonColors))

      const spec: SymbolSpec = { symbol, period }
      this._comparisonSpecs.push(spec)
      const mainSpec = this._symbolsSignal.peek()[0]
      this._symbolsSignal.set(mainSpec ? [mainSpec, ...this._comparisonSpecs] : [...this._comparisonSpecs])

      buffer.setInlineData(data)
      return
    }
    existing.setInlineData(data)
  }

  removeComparisonSymbol(symbol: string): void {
    let found = false
    for (const [key, buf] of this._buffers) {
      if (key.startsWith(BUF_COMPARISON) && key.split(':')[1] === symbol) {
        this.disposeBuffer(key)
        found = true
        break
      }
    }
    if (!found) return

    this._comparisonData.delete(symbol)
    this._comparisonColors.delete(symbol)
    this._comparisonColorsSignal.set(new Map(this._comparisonColors))
    this._comparisonSpecs = this._comparisonSpecs.filter((s) => s.symbol !== symbol)
    this._symbolsSignal.set([this._symbolsSignal.peek()[0]!, ...this._comparisonSpecs])
    this.recomputeComparisonLoading()
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
        this._buffers.set(key, tsBuf)
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
    this.setSymbols([next, ...this._comparisonSpecs])
  }

  applyCustomData(source: CustomDataSource): void {
    if (source.symbol) this.setCurrentSymbol(source.symbol)
    if (source.period) this.setCurrentPeriod(source.period)

    const specs = this._symbolsSignal.peek()
    if (specs.length === 0 && source.symbol) {
      const mainSpec: SymbolSpec = {
        symbol: source.symbol,
        period: source.period ?? 'daily',
      }
      this._symbolsSignal.set([mainSpec])
    }

    const plainData = source.data.map((d) => ({ ...d }))
    this.setData(plainData)
    if (source.comparisons) {
      for (const key of this._comparisonData.keys()) {
        if (!source.comparisons[key]) this.removeComparisonSymbol(key)
      }
      for (const [symbol, data] of Object.entries(source.comparisons)) {
        this.setComparisonData(symbol, data.map((d) => ({ ...d })))
      }
    }
  }

  // ── Main symbol switching ──

  setSymbols(specs: ReadonlyArray<SymbolSpec>): void {
    this._symbolsSignal.set(specs)

    if (specs.length === 0) {
      this._currentSpec = null
      this.disposeAllBuffers()
      this._dataSignal.set([])
      this.lastVisibleRange = { start: 0, end: 0 }
      this.lastRawVisibleRange = { start: 0, end: 0 }
      return
    }

    const primary = specs[0]!
    this._currentSpec = primary

    if (primary.period === 'timeshare') {
      // Switch to timeshare mode
      this.clearComparisonBuffers()
      // Dispose primary KLine buffer
      for (const [key, buf] of this._buffers) {
        if (key.startsWith(BUF_PRIMARY)) {
          this.disposeBuffer(key)
        }
      }
      this._dataSignal.set([])
      this.lastVisibleRange = { start: 0, end: 0 }
      this.lastRawVisibleRange = { start: 0, end: 0 }

      // Get or create timeshare buffer
      const tsKey = bufKey(BUF_TIMESHARE, primary.symbol)
      let tsBuf = this._buffers.get(tsKey) as TimeShareBuffer | undefined
      if (!tsBuf) {
        tsBuf = new TimeShareBuffer()
        tsBuf.setFetcher(this._timeShareFetcher)
        this._buffers.set(tsKey, tsBuf)
      }
      this.activateBuffer(tsKey)
      tsBuf.load(primary)
      return
    }

    // KLine mode
    // Dispose timeshare buffer
    for (const [key, buf] of this._buffers) {
      if (key.startsWith(BUF_TIMESHARE)) {
        this.disposeBuffer(key)
      }
    }

    this.loadKLineSymbols(specs)
  }

  // ── KLine loading ──

  private loadKLineSymbols(specs: ReadonlyArray<SymbolSpec>): void {
    const spec = specs[0]!
    this.syncComparisonBuffers(specs.slice(1))
    if (!this._dataFetcher) return

    const buf = this.getPrimaryDataBuffer(spec.symbol, spec.period!)
    this.activateBuffer(bufKey(BUF_PRIMARY, spec.symbol, spec.period!))

    buf.onPrepend = (count: number) => {
      this.pendingPrependedCount = count
      const dpr = this.deps.getEffectiveDpr()
      const opt = this.deps.getOption()
      const { unitPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)
      const compensation = (count * unitPx) / dpr
      const nextScrollLeft = this.deps.getCachedScrollLeft() + compensation
      this.deps.setScrollLeft(nextScrollLeft)
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
    const opt = this.deps.getOption()
    const viewWidth = this.deps.getViewport()?.plotWidth ?? 0
    const dpr = this.deps.getEffectiveDpr()
    const { startXPx, unitPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)
    const dataPlotWidth = (startXPx + (dataLength + ChartDataManager.TRAILING_SLOTS) * unitPx) / dpr
    return this.getLeftLoadBufferWidth() + Math.max(dataPlotWidth, viewWidth)
  }

  scrollToRight(): void {
    const buf = this.getActiveDataBuffer()
    const dataLength = buf ? buf.getRawData().length : 0
    if (dataLength === 0) return
    const dpr = this.deps.getEffectiveDpr()
    const opt = this.deps.getOption()
    const { unitPx, startXPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)
    const lastKLineEndPx = (startXPx + (dataLength + ChartDataManager.TRAILING_SLOTS) * unitPx) / dpr
    const viewport = this.deps.getViewport()
    const clientWidth = viewport?.viewWidth
      ?? (this.deps.getObservedSize().width > 0 ? this.deps.getObservedSize().width : undefined)
      ?? Math.round(this.deps.getDom().container?.clientWidth ?? 0)
    if (clientWidth <= 0) return
    const target = this.getLeftLoadBufferWidth() + Math.max(0, lastKLineEndPx - clientWidth)
    const contentWidth = this.getContentWidth()
    const maxScroll = Math.max(0, contentWidth - clientWidth)
    const scrollLeft = Math.round(Math.min(target, maxScroll) * dpr) / dpr
    this.deps.setScrollLeft(scrollLeft)
    this.deps.scheduleDraw()
  }

  // ── Comparison price range ──

  getComparisonEquivalentPriceRange(range: VisibleRange): { min: number; max: number } | null {
    if (this._comparisonSpecs.length === 0 || this._comparisonData.size === 0) return null
    const buf = this.getActiveDataBuffer()
    const internalData = buf ? buf.getRawData() : []
    const baseIndex = Math.max(0, range.start)
    const baseItem = internalData[baseIndex]
    if (!baseItem || !Number.isFinite(baseItem.close) || baseItem.close <= 0) return null
    const mainBase = baseItem.close
    const baseDate = baseItem.date ?? ''

    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY

    for (const spec of this._comparisonSpecs) {
      const data = this._comparisonData.get(spec.symbol)
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
    return dataLength + this.getTrailingSlotCount()
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
    for (const key of this._buffers.keys()) {
      this.disposeBuffer(key)
    }
  }

  destroy(): void {
    this._activeBufferUnsub?.()
    this.disposeAllBuffers()
    this.clearIncrementalLoadHintTimer()
    this.incrementalLoadHintEl?.remove()
    this.incrementalLoadHintEl = null
    this.pendingPrependedCount = 0
  }
}

function findComparisonBaselineByDate(data: ReadonlyArray<KLineData>, date: string): KLineData | null {
  for (const item of data) {
    if (item.date && item.date >= date) return item
  }
  return null
}

function findComparisonBaselineByTimestamp(data: ReadonlyArray<KLineData>, timestamp: number): KLineData | null {
  for (const item of data) {
    if (item.timestamp >= timestamp) return item
  }
  return null
}

function batchFormatDate(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}