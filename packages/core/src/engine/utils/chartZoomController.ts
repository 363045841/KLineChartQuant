import { computeZoom, deriveKGap } from './zoom'
import type { ReadonlySignal } from '../../foundation/reactivity/signal'
import type { OptionsStateModule } from '../state/optionsState'
import type { ZoomStateModule } from '../state/zoomState'
import type { ViewportStateModule } from '../state/viewportState'
import { isTimeSharePeriod } from '../../controllers/types'

export interface ZoomDependencies {
  /** scroll / dpr 几何，读写走 kernel.viewport */
  viewport: ViewportStateModule
  /** min/max kWidth / zoomLevelCount SSOT */
  options: OptionsStateModule
  /** 当前周期（kGap 推导） */
  period$: ReadonlySignal<string>
  getClientWidth: () => number
  getDataLength: () => number
  getPlotWidth: () => number
  onChange?: () => void
}

/**
 * 缩放协调器 —— 无本地业务状态。
 * zoomLevel/kWidth 归属 zoomState；此类只解释手势并协调 scroll 副作用。
 */
export class ChartZoomController {
  private readonly deps: ZoomDependencies
  private readonly zoomState: ZoomStateModule

  constructor(deps: ZoomDependencies, zoomState: ZoomStateModule) {
    this.deps = deps
    this.zoomState = zoomState
  }

  get currentZoomLevel(): number {
    return this.zoomState.readonly.zoomLevel.peek()
  }

  get currentKWidth(): number {
    return this.zoomState.readonly.kWidth.peek()
  }

  get currentKGap(): number {
    return deriveKGap({
      kWidth: this.currentKWidth,
      dpr: this.deps.viewport.readonly.dpr.peek(),
      period: this.deps.period$.peek(),
    })
  }

  get zoomLevelCount(): number {
    return this.deps.options.readonly.options.peek().zoomLevelCount
  }

  zoomToLevel(level: number, anchorX?: number): void {
    const clamped = Math.max(1, Math.min(this.zoomLevelCount, Math.round(level)))
    this.applyZoom(clamped, anchorX)
  }

  zoomIn(anchorX?: number): void {
    this.zoomToLevel(this.currentZoomLevel + 1, anchorX)
  }

  zoomOut(anchorX?: number): void {
    this.zoomToLevel(this.currentZoomLevel - 1, anchorX)
  }

  handleWheel(deltaY: number, viewportX: number): void {
    const delta = deltaY > 0 ? -1 : 1
    const targetLevel = Math.max(1, Math.min(this.zoomLevelCount, this.currentZoomLevel + delta))
    if (targetLevel === this.currentZoomLevel) return
    this.applyZoom(targetLevel, viewportX)
  }

  handlePinch(delta: number, centerClientX: number): void {
    const targetLevel = Math.max(1, Math.min(this.zoomLevelCount, this.currentZoomLevel + delta))
    if (targetLevel === this.currentZoomLevel) return
    this.applyZoom(targetLevel, centerClientX)
  }

  private applyZoom(targetLevel: number, anchorViewportX?: number): void {
    if (targetLevel === this.currentZoomLevel) return

    if (isTimeSharePeriod(this.deps.period$.peek())) {
      this.applyTimeShareZoom(targetLevel, anchorViewportX)
      return
    }

    const delta = targetLevel - this.currentZoomLevel
    const logicalScrollLeft = this.deps.viewport.readonly.scrollLeftLogical.peek()
    const dpr = this.deps.viewport.readonly.dpr.peek()
    const opt = this.deps.options.readonly.options.peek()

    const result = computeZoom(
      delta,
      anchorViewportX ?? 0,
      logicalScrollLeft,
      this.currentZoomLevel,
      this.currentKWidth,
      this.currentKGap,
      {
        minKWidth: opt.minKWidth,
        maxKWidth: opt.maxKWidth,
        zoomLevelCount: opt.zoomLevelCount,
        dpr,
        dataLength: this.deps.getDataLength(),
        plotWidth: this.deps.getPlotWidth(),
        clientWidth: this.deps.getClientWidth(),
      },
    )

    if (!result) return

    this.zoomState.actions.setZoomLevel(result.targetLevel)
    this.deps.viewport.actions.scrollTo(result.newDomScrollLeft)
    this.deps.onChange?.()
  }

  /** 缩放分时槽位宽度，并让手势锚点保持在同一世界坐标。 */
  private applyTimeShareZoom(targetLevel: number, anchorViewportX?: number): void {
    const dpr = this.deps.viewport.readonly.dpr.peek()
    const currentWidth = this.zoomState.readonly.timeShareSlotWidth.peek() ?? 1 / dpr
    const currentWidthPx = Math.max(1, Math.round(currentWidth * dpr))
    const delta = targetLevel - this.currentZoomLevel
    const nextWidthPx = Math.max(1, currentWidthPx + delta)
    if (nextWidthPx === currentWidthPx) return

    const anchor = anchorViewportX ?? 0
    const scrollLeft = this.deps.viewport.readonly.scrollLeftLogical.peek()
    const nextScrollLeft = ((scrollLeft + anchor) * nextWidthPx) / currentWidthPx - anchor

    this.zoomState.actions.setZoomLevel(targetLevel)
    this.zoomState.actions.setTimeShareSlotWidth(nextWidthPx / dpr)
    this.deps.viewport.actions.scrollTo(nextScrollLeft)
    this.deps.onChange?.()
  }
}
