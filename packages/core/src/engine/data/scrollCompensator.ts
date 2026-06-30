import type { ChartDom, Viewport } from '../chartTypes'
import { getPhysicalKLineConfig } from '../utils/klineConfig'

export interface ScrollDeps {
  getOption: () => { kWidth: number; kGap: number }
  getEffectiveDpr: () => number
  getCachedScrollLeft: () => number
  setScrollLeft: (v: number) => void
  getDom: () => ChartDom
  getObservedSize: () => { width: number; height: number }
  getViewport: () => Viewport | null
}

export class ScrollCompensator {
  constructor(private deps: ScrollDeps) {}

  compensatePrepend(count: number): void {
    const dpr = this.deps.getEffectiveDpr()
    const opt = this.deps.getOption()
    const { unitPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)
    const compensation = (count * unitPx) / dpr
    const nextScrollLeft = this.deps.getCachedScrollLeft() + compensation
    this.deps.setScrollLeft(nextScrollLeft)
  }

  adjustScrollAfterDataChange(dataLength: number): void {
    const scrollLeft = this.deps.getCachedScrollLeft()
    if (scrollLeft < 0) return

    if (scrollLeft <= 0) {
      this.deps.setScrollLeft(this.getLeftLoadBufferWidth(dataLength))
      return
    }

    const dpr = this.deps.getEffectiveDpr()
    const opt = this.deps.getOption()
    const { unitPx, startXPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)
    const totalDataWidth = (startXPx + dataLength * unitPx) / dpr
    const leftBuffer = this.getLeftLoadBufferWidth(dataLength)
    if (scrollLeft >= leftBuffer + totalDataWidth) {
      this.deps.setScrollLeft(leftBuffer)
    }
  }

  scrollToRight(dataLength: number): void {
    if (dataLength === 0) return
    const dpr = this.deps.getEffectiveDpr()
    const opt = this.deps.getOption()
    const { unitPx, startXPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)
    const lastKLineEndPx = (startXPx + dataLength * unitPx) / dpr
    const viewport = this.deps.getViewport()
    const clientWidth =
      viewport?.viewWidth ??
      (this.deps.getObservedSize().width > 0
        ? this.deps.getObservedSize().width
        : undefined) ??
      Math.round(this.deps.getDom().container?.clientWidth ?? 0)
    if (clientWidth <= 0) return

    const leftBuffer = this.getLeftLoadBufferWidth(dataLength)
    let target: number
    if (lastKLineEndPx <= clientWidth) {
      target = leftBuffer - (clientWidth - lastKLineEndPx)
    } else {
      target = leftBuffer + (lastKLineEndPx - clientWidth)
    }
    const contentWidth = this.getContentWidth(dataLength)
    const maxScroll = Math.max(0, contentWidth - clientWidth)
    const scrollLeft = Math.round(Math.max(0, Math.min(target, maxScroll)) * dpr) / dpr
    this.deps.setScrollLeft(scrollLeft)
  }

  getLeftLoadBufferWidth(dataLength: number): number {
    if (dataLength === 0) return 0
    const vp = this.deps.getViewport()
    return (
      vp?.plotWidth ??
      (this.deps.getObservedSize().width > 0 ? this.deps.getObservedSize().width : undefined) ??
      Math.round(this.deps.getDom().container?.clientWidth ?? 0)
    )
  }

  getContentWidth(dataLength: number): number {
    if (dataLength === 0) return 0
    const opt = this.deps.getOption()
    const viewWidth = this.deps.getViewport()?.plotWidth ?? 0
    const dpr = this.deps.getEffectiveDpr()
    const { startXPx, unitPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)
    const TRAILING_SLOTS = 30
    const dataPlotWidth = (startXPx + (dataLength + TRAILING_SLOTS) * unitPx) / dpr
    return this.getLeftLoadBufferWidth(dataLength) + Math.max(dataPlotWidth, viewWidth)
  }
}