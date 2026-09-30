import { isTimeSharePeriod } from '../../controllers/types.js'
import type { ReadonlySignal } from '../../foundation/reactivity/signal.js'
import type { OptionsStateModule } from '../state/optionsState.js'
import type { ViewportStateModule } from '../state/viewportState.js'
import type { ZoomStateModule } from '../state/zoomState.js'
import { clampZoomLevel, computeZoom, deriveKGap } from './zoom.js'

export interface ZoomDependencies {
  /** scroll / dpr 几何，读写走 kernel.viewport */
  viewport: ViewportStateModule
  /** min/max kWidth / zoomLevelCount SSOT */
  options: OptionsStateModule
  /** 当前周期（kGap 推导） */
  period$: ReadonlySignal<string>
  /** 左侧加载缓冲宽度：逻辑滚动量转 DOM 滚动位置的唯一换算量 */
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
    this.applyZoom(level, anchorX)
  }

  zoomIn(anchorX?: number): void {
    this.applyZoom(this.currentZoomLevel + 1, anchorX)
  }

  zoomOut(anchorX?: number): void {
    this.applyZoom(this.currentZoomLevel - 1, anchorX)
  }

  handleWheel(deltaY: number, viewportX: number): void {
    this.applyZoom(this.currentZoomLevel + (deltaY > 0 ? -1 : 1), viewportX)
  }

  handlePinch(delta: number, centerClientX: number): void {
    this.applyZoom(this.currentZoomLevel + delta, centerClientX)
  }

  /** 将级别夹取后分发到 K 线 / 分时缩放路径；级别不变则不动。 */
  private applyZoom(level: number, anchorViewportX?: number): void {
    const targetLevel = clampZoomLevel(level, this.zoomLevelCount)
    if (targetLevel === this.currentZoomLevel) return

    if (isTimeSharePeriod(this.deps.period$.peek())) {
      this.applyTimeShareZoom(targetLevel, anchorViewportX)
      return
    }

    const opt = this.deps.options.readonly.options.peek()
    const result = computeZoom({
      targetLevel,
      currentLevel: this.currentZoomLevel,
      currentKWidth: this.currentKWidth,
      currentKGap: this.currentKGap,
      anchorViewportX: anchorViewportX ?? 0,
      scrollLeftLogical: this.deps.viewport.readonly.scrollLeftLogical.peek(),
      dpr: this.deps.viewport.readonly.dpr.peek(),
      config: {
        minKWidth: opt.minKWidth,
        maxKWidth: opt.maxKWidth,
        zoomLevelCount: opt.zoomLevelCount,
      },
    })
    if (!result) return

    // 先落级别：viewportState 会用新几何同步重算 maxScrollLeft，再由 scrollTo 统一夹取
    this.zoomState.actions.setZoomLevel(result.targetLevel)
    this.deps.viewport.actions.scrollTo(result.scrollLeftLogical + this.deps.getPlotWidth())
    this.deps.onChange?.()
  }

  /** 缩放分时槽位宽度，并让手势锚点保持在同一世界坐标。 */
  private applyTimeShareZoom(targetLevel: number, anchorViewportX?: number): void {
    const dpr = this.deps.viewport.readonly.dpr.peek()
    const currentWidth = this.zoomState.readonly.timeShareSlotWidth.peek() ?? 1 / dpr
    const currentWidthPx = Math.max(1, Math.round(currentWidth * dpr))
    const nextWidthPx = Math.max(1, currentWidthPx + (targetLevel - this.currentZoomLevel))
    if (nextWidthPx === currentWidthPx) return

    const anchor = anchorViewportX ?? 0
    const scrollLeft = this.deps.viewport.readonly.scrollLeftLogical.peek()
    const nextScrollLeft = ((scrollLeft + anchor) * nextWidthPx) / currentWidthPx - anchor

    this.zoomState.actions.setZoomLevel(targetLevel)
    this.zoomState.actions.setTimeShareSlotWidth(nextWidthPx / dpr)
    this.deps.viewport.actions.scrollTo(nextScrollLeft + this.deps.getPlotWidth())
    this.deps.onChange?.()
  }
}
