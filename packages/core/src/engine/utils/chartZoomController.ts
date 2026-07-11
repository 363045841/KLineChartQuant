import { computeZoom, zoomLevelToKWidth, kGapFromKWidth } from './zoom'
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
  zoomLevelCount: number
  initialZoomLevel: number
}

export class ChartZoomController {
  private readonly deps: ZoomDependencies
  private _zoomState: ZoomStateModule

  constructor(deps: ZoomDependencies, zoomState: ZoomStateModule) {
    this.deps = deps
    this._zoomState = zoomState
    const clamped = Math.max(1, Math.min(deps.zoomLevelCount, deps.initialZoomLevel ?? 1))
    this._zoomState.actions.setZoomLevel(clamped)
  }

  get currentZoomLevel(): number {
    return this._zoomState.readonly.zoomLevel.peek()
  }

  get currentKWidth(): number {
    return this._zoomState.readonly.kWidth.peek()
  }

  get currentKGap(): number {
    return this._zoomState.readonly.kGap.peek()
  }

  get zoomLevelCount(): number {
    return this.deps.zoomLevelCount
  }

  setZoomLevel(level: number): void {
    const clamped = Math.max(1, Math.min(this.deps.zoomLevelCount, level))
    this._zoomState.actions.setZoomLevel(clamped)
  }

  setKWidthKGap(kWidth: number, kGap: number): void {
    // kWidth/kGap are now derived from zoomLevel via zoomState computed.
    // For direct kWidth/kGap mode (timeshare), the chart sets zoomLevel to
    // a value that produces the desired kWidth/kGap.
    // This method is preserved for backwards compatibility: find the closest
    // zoomLevel that approximates the given kWidth.
    const kw = zoomLevelToKWidth(1, {
      minKWidth: this.deps.getMinKWidth(),
      maxKWidth: this.deps.getMaxKWidth(),
      zoomLevelCount: this.deps.zoomLevelCount,
    })
    // Use kWidth/kGap ratio to estimate a zoom level: linear interpolation
    const w = this.deps.getMinKWidth()
    const w2 = this.deps.getMaxKWidth()
    const ratio = (kWidth - w) / (w2 - w || 1)
    const level = Math.max(1, Math.min(this.deps.zoomLevelCount, Math.round(1 + ratio * (this.deps.zoomLevelCount - 1))))
    this._zoomState.actions.setZoomLevel(level)
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

    this._zoomState.actions.setZoomLevel(result.targetLevel)
    this.deps.setScrollLeft(result.newDomScrollLeft)
    this.deps.onChange?.()
  }
}