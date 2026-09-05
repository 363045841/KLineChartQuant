/**
 * ChartZoomFacade —— 图表缩放的公开操作。
 */
import type { ChartStateKernel } from '../state/chartStateKernel'
import type { ChartZoomController } from '../utils/chartZoomController'

/** Zoom Facade 所需依赖。 */
export interface ChartZoomFacadeDependencies {
  kernel: ChartStateKernel
  controller: ChartZoomController
}

/** 提供受交互能力约束的缩放操作。 */
export class ChartZoomFacade {
  constructor(private readonly deps: ChartZoomFacadeDependencies) {}

  /** 返回可用缩放级别数。 */
  getLevelCount(): number {
    return this.deps.kernel.options.readonly.options.peek().zoomLevelCount
  }

  /** 缩放到指定级别。 */
  toLevel(level: number, anchorX?: number): void {
    if (!this.deps.kernel.mode.readonly.interactionCapabilities.peek().allowZoom) return
    this.deps.controller.zoomToLevel(level, anchorX)
  }

  /** 放大一级。 */
  in(anchorX?: number): void {
    if (!this.deps.kernel.mode.readonly.interactionCapabilities.peek().allowZoom) return
    this.deps.controller.zoomIn(anchorX)
  }

  /** 缩小一级。 */
  out(anchorX?: number): void {
    if (!this.deps.kernel.mode.readonly.interactionCapabilities.peek().allowZoom) return
    this.deps.controller.zoomOut(anchorX)
  }
}
