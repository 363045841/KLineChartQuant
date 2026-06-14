import { computeZoom } from './zoom'

export interface ZoomCommittedResult {
  kWidth: number
  kGap: number
  zoomLevel: number
}

export interface ZoomDependencies {
  getLogicalScrollLeft: () => number
  getCurrentDpr: () => number
  getLeftLoadBufferWidth: () => number
  setScrollLeft: (v: number) => void
  onZoomCommitted: (result: ZoomCommittedResult) => void
  getKWidth: () => number
  getKGap: () => number
  getMinKWidth: () => number
  getMaxKWidth: () => number
  zoomLevelCount: number
  initialZoomLevel: number
}

export class ChartZoomController {
  private _currentZoomLevel: number
  private readonly deps: ZoomDependencies

  constructor(deps: ZoomDependencies) {
    this.deps = deps
    const clamped = Math.max(1, Math.min(deps.zoomLevelCount, deps.initialZoomLevel ?? 1))
    this._currentZoomLevel = clamped
  }

  get currentZoomLevel(): number {
    return this._currentZoomLevel
  }

  get zoomLevelCount(): number {
    return this.deps.zoomLevelCount
  }

  setZoomLevel(level: number): void {
    this._currentZoomLevel = Math.max(1, Math.min(this.deps.zoomLevelCount, level))
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
    const targetLevel = Math.max(1, Math.min(this.deps.zoomLevelCount, this._currentZoomLevel + delta))
    if (targetLevel === this._currentZoomLevel) return
    this.applyZoom(targetLevel, viewportX)
  }

  handlePinch(delta: number, centerClientX: number): void {
    const targetLevel = Math.max(1, Math.min(this.deps.zoomLevelCount, this._currentZoomLevel + delta))
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
      this.deps.getKWidth(),
      this.deps.getKGap(),
      {
        minKWidth: this.deps.getMinKWidth(),
        maxKWidth: this.deps.getMaxKWidth(),
        zoomLevelCount: this.deps.zoomLevelCount,
        dpr,
      },
    )

    if (!result) return

    const domScrollLeft = result.newScrollLeft + this.deps.getLeftLoadBufferWidth()
    this._currentZoomLevel = result.targetLevel
    this.deps.setScrollLeft(domScrollLeft)
    this.deps.onZoomCommitted({
      kWidth: result.newKWidth,
      kGap: result.newKGap,
      zoomLevel: result.targetLevel,
    })
  }
}
