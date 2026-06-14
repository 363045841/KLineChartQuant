import type { KLineData } from '../../types/price'
import type { SymbolSpec, DataFetcher } from '../../controllers/types'
import { createSignal, type Signal } from '../../reactivity/signal'
import { DataBuffer } from '../../data-fetchers/dataBuffer'
import type { ChartDom, Viewport } from '../chartTypes'
import type { VisibleRange, UpdateLevel } from '../layout/pane'
import { getVisibleRange } from '../viewport/viewport'
import { getPhysicalKLineConfig } from '../utils/klineConfig'

export interface DataDependencies {
  getOption: () => { kWidth: number; kGap: number }
  getEffectiveDpr: () => number
  getLogicalScrollLeft: () => number
  getCachedScrollLeft: () => number
  setCachedScrollLeft: (v: number) => void
  setPendingScrollLeft: (v: number) => void
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
}

export class ChartDataManager {
  private _internalData: KLineData[] = []
  private _dataFetcher: DataFetcher | null = null
  private _dataBuffer: DataBuffer = new DataBuffer()
  private _dataBufferUnsub: (() => void) | null = null
  private _comparisonSpecs: SymbolSpec[] = []
  private _comparisonData: Map<string, KLineData[]> = new Map()
  private _comparisonBuffers: Map<string, DataBuffer> = new Map()
  private _comparisonBufferUnsubs: Map<string, () => void> = new Map()

  private _dataSignal = createSignal<ReadonlyArray<KLineData>>([])
  private _symbolsSignal = createSignal<ReadonlyArray<SymbolSpec>>([])

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

  private getScrollContentHost(): HTMLDivElement | null {
    return this.deps.getDom().scrollContent ?? this.deps.getDom().container ?? null
  }

  getLeftLoadBufferWidth(): number {
    if (this._internalData.length === 0) return 0
    const plotWidth = this.deps.getViewport()?.plotWidth
      ?? (this.deps.getObservedSize().width > 0 ? this.deps.getObservedSize().width : undefined)
      ?? Math.round(this.deps.getDom().container?.clientWidth ?? 0)
    return Math.max(0, plotWidth)
  }

  private computeRawVisibleRange(): VisibleRange | null {
    if (this._internalData.length === 0) return null
    const vp = this.deps.getViewport()
    if (!vp) return null
    const opt = this.deps.getOption()
    return getVisibleRange(
      vp.scrollLeft,
      vp.plotWidth,
      opt.kWidth,
      opt.kGap,
      this._internalData.length,
      vp.dpr,
    )
  }

  private getTrailingSlotCount(): number {
    return 24
  }

  private static readonly LEADING_SLOTS = 60
  private static readonly TRAILING_DRAWING_SLOTS = 24

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
    hint.style.left = '0'
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
    const width = this.getLeftLoadBufferWidth() + (startXPx + count * unitPx) / dpr
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

  get data(): Signal<ReadonlyArray<KLineData>> {
    return this._dataSignal
  }

  get symbols(): Signal<ReadonlyArray<SymbolSpec>> {
    return this._symbolsSignal
  }

  getInternalData(): KLineData[] {
    return this._internalData
  }

  getComparisonData(): Map<string, KLineData[]> {
    return this._comparisonData
  }

  getComparisonSpecs(): SymbolSpec[] {
    return this._comparisonSpecs
  }

  get dataBuffer(): DataBuffer {
    return this._dataBuffer
  }

  updateData(data: KLineData[]): void {
    this._internalData = data ?? []
    this._dataSignal.set([...this._internalData])

    const container = this.deps.getDom().container
    if (container) {
      const minScrollLeft = this.getLeftLoadBufferWidth()
      if (this.deps.getCachedScrollLeft() < minScrollLeft) {
        this.deps.setCachedScrollLeft(minScrollLeft)
        this.deps.setPendingScrollLeft(minScrollLeft)
      }
      const contentWidth = this.getContentWidth()
      const maxScrollLeft = Math.max(0, contentWidth - container.clientWidth)
      if (this.deps.getCachedScrollLeft() > maxScrollLeft) {
        this.deps.setCachedScrollLeft(maxScrollLeft)
        this.deps.setPendingScrollLeft(maxScrollLeft)
      }
    }

    this.deps.resetInteraction()

    if (this.lastVisibleRange.start === 0 && this.lastVisibleRange.end === 0 && this._internalData.length > 0) {
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
        this._internalData.length,
        dpr,
      )
      this.lastRawVisibleRange = { start, end }
      this.lastVisibleRange = { start: Math.max(0, start), end }
    }

    const scheduler = this.deps.getIndicatorScheduler()
    const indicatorsReady = scheduler.update(this._internalData, this.lastVisibleRange)
    if (indicatorsReady) {
      this.pendingIndicatorDataUpdate = false
      this.deps.scheduleDraw()
    } else {
      this.pendingIndicatorDataUpdate = true
    }
  }

  setData(data: KLineData[]): void {
    this.updateData(data)
  }

  appendData(newData: KLineData[]): void {
    const merged = [...this._internalData, ...newData]
    this.setData(merged)
  }

  getData(): KLineData[] {
    return this._internalData
  }

  setDataFetcher(fetcher: DataFetcher | null): void {
    this._dataFetcher = fetcher
    this._dataBuffer.setFetcher(fetcher)
    for (const buffer of this._comparisonBuffers.values()) {
      buffer.setFetcher(fetcher)
    }
  }

  checkVisibleRangeGap(): void {
    if (this._internalData.length === 0) return
    const window = this._dataBuffer.loadedWindow
    if (!window) return
    const range = this.computeRawVisibleRange() ?? this.lastRawVisibleRange

    if (range.start < 0 && this._dataFetcher) {
      const MS_PER_DAY = 86_400_000
      const earlierThanEarliest = window.earliestTs - 90 * MS_PER_DAY
      this._dataBuffer.ensureRange(earlierThanEarliest, window.earliestTs)
      return
    }

    if (range.start >= this._internalData.length) return
    const firstVisibleTs = this._internalData[Math.max(0, range.start)]?.timestamp
    if (firstVisibleTs === undefined) return
    if (firstVisibleTs < window.earliestTs) {
      this._dataBuffer.ensureRange(firstVisibleTs, window.earliestTs)
    }
  }

  private syncComparisonBuffers(specs: ReadonlyArray<SymbolSpec>): void {
    this._comparisonSpecs = [...specs]
    const nextKeys = new Set(specs.map((spec) => spec.symbol))

    for (const [key, buffer] of this._comparisonBuffers) {
      if (nextKeys.has(key)) continue
      this._comparisonBufferUnsubs.get(key)?.()
      this._comparisonBufferUnsubs.delete(key)
      buffer.dispose()
      this._comparisonBuffers.delete(key)
      this._comparisonData.delete(key)
    }

    if (!this._dataFetcher) return

    for (const spec of specs) {
      const key = spec.symbol
      let buffer = this._comparisonBuffers.get(key)
      if (!buffer) {
        const newBuffer = new DataBuffer()
        newBuffer.setFetcher(this._dataFetcher)
        this._comparisonBuffers.set(key, newBuffer)
        const unsubscribe = newBuffer.data.subscribe(() => {
          this._comparisonData.set(key, [...newBuffer.data.peek()])
          this.deps.scheduleDraw()
        })
        this._comparisonBufferUnsubs.set(key, unsubscribe)
        buffer = newBuffer
      } else {
        buffer.setFetcher(this._dataFetcher)
      }
      buffer.setSymbol(spec)
    }
  }

  private clearComparisonBuffers(): void {
    for (const unsubscribe of this._comparisonBufferUnsubs.values()) unsubscribe()
    this._comparisonBufferUnsubs.clear()
    for (const buffer of this._comparisonBuffers.values()) buffer.dispose()
    this._comparisonBuffers.clear()
    this._comparisonData.clear()
    this._comparisonSpecs = []
  }

  setSymbols(specs: ReadonlyArray<SymbolSpec>): void {
    this._symbolsSignal.set(specs)
    if (specs.length === 0) {
      this.clearComparisonBuffers()
      return
    }
    const spec = specs[0]!
    this.syncComparisonBuffers(specs.slice(1))
    if (!this._dataFetcher) return

    this._dataBuffer.setFetcher(this._dataFetcher)

    this._dataBuffer.onPrepend = (count: number) => {
      this.pendingPrependedCount = count
      const dpr = this.deps.getEffectiveDpr()
      const opt = this.deps.getOption()
      const { unitPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)
      const compensation = (count * unitPx) / dpr
      const container = this.deps.getDom().container
      if (container) {
        container.scrollLeft += compensation
        this.deps.setCachedScrollLeft(container.scrollLeft)
      }
    }

    if (!this._dataBufferUnsub) {
      this._dataBufferUnsub = this._dataBuffer.data.subscribe(() => {
        const prevLength = this._internalData.length
        const bufferData = this._dataBuffer.data.peek()
        this._internalData = [...bufferData]
        this._dataSignal.set([...this._internalData])
        const prependedCount = this.pendingPrependedCount
        this.pendingPrependedCount = 0

        if (this.deps.getCachedScrollLeft() < this.getLeftLoadBufferWidth()) {
          const desiredScrollLeft = this.getLeftLoadBufferWidth()
          this.deps.setCachedScrollLeft(desiredScrollLeft)
          this.deps.setPendingScrollLeft(desiredScrollLeft)
        }

        if (prevLength === 0 && this._internalData.length > 0) {
          const dpr = this.deps.getEffectiveDpr()
          const opt = this.deps.getOption()
          const { unitPx, startXPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)
          const lastKLineEndPx = (startXPx + this._internalData.length * unitPx) / dpr
          const container = this.deps.getDom().container
          if (container) {
            const target = this.getLeftLoadBufferWidth() + Math.max(0, lastKLineEndPx - container.clientWidth)
            const contentWidth = this.getContentWidth()
            const maxScroll = Math.max(0, contentWidth - container.clientWidth)
            const scrollLeft = Math.round(Math.min(target, maxScroll) * dpr) / dpr
            this.deps.setCachedScrollLeft(scrollLeft)
            this.deps.setPendingScrollLeft(scrollLeft)
          }
        }

        this.deps.resetInteraction()

        if (this.lastVisibleRange.start === 0 && this.lastVisibleRange.end === 0 && this._internalData.length > 0) {
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
            this._internalData.length,
            dpr,
          )
          this.lastRawVisibleRange = { start, end }
          this.lastVisibleRange = { start: Math.max(0, start), end }
        }

        const scheduler = this.deps.getIndicatorScheduler()
        const indicatorsReady = scheduler.update(this._internalData, this.lastVisibleRange)
        if (indicatorsReady) {
          this.pendingIndicatorDataUpdate = false
          this.deps.scheduleDraw()
        } else {
          this.pendingIndicatorDataUpdate = true
        }

        this.showIncrementalLoadHint(prependedCount)
      })
    }

    this._dataBuffer.setSymbol(spec)
  }

  getContentWidth(): number {
    const dataLength = this._internalData.length
    if (dataLength === 0) return 0
    const opt = this.deps.getOption()
    const viewWidth = this.deps.getViewport()?.plotWidth ?? 0
    const dpr = this.deps.getEffectiveDpr()
    const { startXPx, unitPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)
    const dataPlotWidth = (startXPx + (ChartDataManager.LEADING_SLOTS + dataLength + ChartDataManager.TRAILING_DRAWING_SLOTS) * unitPx) / dpr
    return this.getLeftLoadBufferWidth() + Math.max(dataPlotWidth, viewWidth)
  }

  scrollToRight(): void {
    const container = this.deps.getDom().container
    if (!container || this._internalData.length === 0) return
    const dpr = this.deps.getEffectiveDpr()
    const opt = this.deps.getOption()
    const { unitPx, startXPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)
    const lastKLineEndPx = (startXPx + this._internalData.length * unitPx) / dpr
    const target = this.getLeftLoadBufferWidth() + Math.max(0, lastKLineEndPx - container.clientWidth)
    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth)
    container.scrollLeft = Math.round(Math.min(target, maxScroll) * dpr) / dpr
    this.deps.setCachedScrollLeft(container.scrollLeft)
  }

  getComparisonEquivalentPriceRange(range: VisibleRange): { min: number; max: number } | null {
    if (this._comparisonSpecs.length === 0 || this._comparisonData.size === 0) return null
    const baseIndex = Math.max(0, range.start)
    const mainBase = this._internalData[baseIndex]?.close
    const baseTimestamp = this._internalData[baseIndex]?.timestamp
    if (!Number.isFinite(mainBase) || mainBase <= 0 || baseTimestamp === undefined) return null

    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY

    for (const spec of this._comparisonSpecs) {
      const data = this._comparisonData.get(spec.symbol)
      if (!data?.length) continue

      const baseline = this.findComparisonBaseline(data, baseTimestamp)
      if (!baseline || !Number.isFinite(baseline.close) || baseline.close <= 0) continue

      const byTimestamp = new Map<number, KLineData>()
      for (const item of data) byTimestamp.set(item.timestamp, item)

      for (let i = Math.max(0, range.start); i < range.end && i < this._internalData.length; i++) {
        const mainItem = this._internalData[i]
        if (!mainItem) continue
        const item = byTimestamp.get(mainItem.timestamp)
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

  private findComparisonBaseline(data: ReadonlyArray<KLineData>, timestamp: number): KLineData | null {
    for (const item of data) {
      if (item.timestamp >= timestamp) return item
    }
    return null
  }

  getLogicalSlotCount(): number {
    return this._internalData.length + this.getTrailingSlotCount()
  }

  getTimestampAtLogicalIndex(index: number): number | null {
    if (!Number.isInteger(index) || index < 0 || index >= this._internalData.length) return null
    return this._internalData[index]?.timestamp ?? null
  }

  getLogicalIndexAtX(mouseX: number): number | null {
    const vp = this.deps.getViewport()
    if (!vp || this._internalData.length === 0) return null
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
    if (index === null || index >= this._internalData.length) return null
    return index
  }

  destroy(): void {
    if (this._dataBufferUnsub) {
      this._dataBufferUnsub()
      this._dataBufferUnsub = null
    }
    this.clearIncrementalLoadHintTimer()
    this.incrementalLoadHintEl?.remove()
    this.incrementalLoadHintEl = null
    this.pendingPrependedCount = 0
    this._dataBuffer.dispose()
    this.clearComparisonBuffers()
  }
}
