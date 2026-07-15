import { computeZoom, deriveKGap } from './zoom'
import type { ZoomStateModule } from '../state/zoomState'

export interface ZoomDependencies {
  getLogicalScrollLeft: () => number
  getCurrentDpr: () => number
  getClientWidth: () => number
  getDataLength: () => number
  getPlotWidth: () => number
  setScrollLeft: (v: number) => void
  onChange?: () => void
  getMinKWidth: () => number
  getMaxKWidth: () => number
  getPeriod: () => string
  zoomLevelCount: number
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
      dpr: this.deps.getCurrentDpr(),
      period: this.deps.getPeriod(),
    })
  }

  get zoomLevelCount(): number {
    return this.deps.zoomLevelCount
  }

  zoomToLevel(level: number, anchorX?: number): void {
    const clamped = Math.max(1, Math.min(this.deps.zoomLevelCount, Math.round(level)))
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
    const targetLevel = Math.max(
      1,
      Math.min(this.deps.zoomLevelCount, this.currentZoomLevel + delta),
    )
    if (targetLevel === this.currentZoomLevel) return
    this.applyZoom(targetLevel, viewportX)
  }

  handlePinch(delta: number, centerClientX: number): void {
    const targetLevel = Math.max(
      1,
      Math.min(this.deps.zoomLevelCount, this.currentZoomLevel + delta),
    )
    if (targetLevel === this.currentZoomLevel) return
    this.applyZoom(targetLevel, centerClientX)
  }

  private applyZoom(targetLevel: number, anchorViewportX?: number): void {
    if (targetLevel === this.currentZoomLevel) return

    const delta = targetLevel - this.currentZoomLevel
    const logicalScrollLeft = this.deps.getLogicalScrollLeft()
    const dpr = this.deps.getCurrentDpr()

    const result = computeZoom(
      delta,
      anchorViewportX ?? 0,
      logicalScrollLeft,
      this.currentZoomLevel,
      this.currentKWidth,
      this.currentKGap,
      {
        minKWidth: this.deps.getMinKWidth(),
        maxKWidth: this.deps.getMaxKWidth(),
        zoomLevelCount: this.deps.zoomLevelCount,
        dpr,
        dataLength: this.deps.getDataLength(),
        plotWidth: this.deps.getPlotWidth(),
        clientWidth: this.deps.getClientWidth(),
      },
    )

    if (!result) return

    this.zoomState.actions.setZoomLevel(result.targetLevel)
    this.deps.setScrollLeft(result.newDomScrollLeft)
    this.deps.onChange?.()
  }
}
