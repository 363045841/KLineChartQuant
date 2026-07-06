import { computeZoom, zoomLevelToKWidth, kGapFromKWidth } from './zoom'

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
  private _currentZoomLevel: number
  private _currentKWidth: number
  private _currentKGap: number
  private readonly deps: ZoomDependencies

  constructor(deps: ZoomDependencies) {
    this.deps = deps
    const clamped = Math.max(1, Math.min(deps.zoomLevelCount, deps.initialZoomLevel ?? 1))
    this._currentZoomLevel = clamped
    this._currentKWidth = zoomLevelToKWidth(clamped, {
      minKWidth: deps.getMinKWidth(),
      maxKWidth: deps.getMaxKWidth(),
      zoomLevelCount: deps.zoomLevelCount,
    })
    this._currentKGap = kGapFromKWidth(this._currentKWidth, deps.getCurrentDpr())
  }

  get currentZoomLevel(): number {
    return this._currentZoomLevel
  }

  get currentKWidth(): number {
    return this._currentKWidth
  }

  get currentKGap(): number {
    return this._currentKGap
  }

  get zoomLevelCount(): number {
    return this.deps.zoomLevelCount
  }

  setZoomLevel(level: number): void {
    this._currentZoomLevel = Math.max(1, Math.min(this.deps.zoomLevelCount, level))
    this._currentKWidth = zoomLevelToKWidth(this._currentZoomLevel, {
      minKWidth: this.deps.getMinKWidth(),
      maxKWidth: this.deps.getMaxKWidth(),
      zoomLevelCount: this.deps.zoomLevelCount,
    })
    this._currentKGap = kGapFromKWidth(this._currentKWidth, this.deps.getCurrentDpr())
  }

  setKWidthKGap(kWidth: number, kGap: number): void {
    this._currentKWidth = kWidth
    this._currentKGap = kGap
  }

  zoomToLevel(level: number, anchorX?: number): void {
    const clamped = Math.max(1, Math.min(this.deps.zoomLevelCount, Math.round(level)))
    this.applyZoom(clamped, anchorX)
  }

  zoomIn(anchorX?: number): void {
    this.zoomToLevel(this._currentZoomLevel + 1, anchorX)
  }

  zoomOut(anchorX?: number): void {
    this.zoomToLevel(this._currentZoomLevel - 1, anchorX)
  }

  handleWheel(deltaY: number, viewportX: number): void {
    const delta = deltaY > 0 ? -1 : 1
    const targetLevel = Math.max(
      1,
      Math.min(this.deps.zoomLevelCount, this._currentZoomLevel + delta),
    )
    if (targetLevel === this._currentZoomLevel) return
    this.applyZoom(targetLevel, viewportX)
  }

  handlePinch(delta: number, centerClientX: number): void {
    const targetLevel = Math.max(
      1,
      Math.min(this.deps.zoomLevelCount, this._currentZoomLevel + delta),
    )
    if (targetLevel === this._currentZoomLevel) return
    this.applyZoom(targetLevel, centerClientX)
  }

  private applyZoom(targetLevel: number, anchorViewportX?: number): void {
    if (targetLevel === this._currentZoomLevel) return

    const delta = targetLevel - this._currentZoomLevel
    const logicalScrollLeft = this.deps.getLogicalScrollLeft()
    const dpr = this.deps.getCurrentDpr()

    const result = computeZoom(
      delta,
      anchorViewportX ?? 0,
      logicalScrollLeft,
      this._currentZoomLevel,
      this._currentKWidth,
      this._currentKGap,
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

    this._currentZoomLevel = result.targetLevel
    this._currentKWidth = result.newKWidth
    this._currentKGap = result.newKGap
    this.deps.setScrollLeft(result.newDomScrollLeft)
    this.deps.onChange?.()
  }
}
