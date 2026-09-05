/**
 * ChartMarkerFacade —— 自定义标记状态与位置缓存协调。
 */
import type { ChartRenderer } from '../render/chartRenderer'
import type { ChartStateKernel } from '../state/chartStateKernel'
import type { CustomMarkerEntity, MarkerManager } from '../marker/registry'

/** Marker Facade 所需依赖。 */
export interface ChartMarkerFacadeDependencies {
  kernel: ChartStateKernel
  renderer: ChartRenderer
  scheduleDraw: () => void
}

/** 提供自定义标记的公开操作。 */
export class ChartMarkerFacade {
  constructor(private readonly deps: ChartMarkerFacadeDependencies) {}

  /** 返回运行时标记管理器。 */
  getManager(): MarkerManager {
    return this.deps.renderer.getMarkerManager()
  }

  /** 使用完整快照更新自定义标记。 */
  update(markers: CustomMarkerEntity[]): void {
    this.deps.kernel.marker.actions.setCustomMarkers(markers)
    this.invalidatePositions()
  }

  /** 注册或覆盖单个自定义标记。 */
  register(marker: CustomMarkerEntity): void {
    this.deps.kernel.marker.actions.registerCustomMarker(marker)
    this.invalidatePositions()
  }

  /** 清除全部自定义标记。 */
  clear(): void {
    this.deps.kernel.marker.actions.clearCustomMarkers()
    this.invalidatePositions()
  }

  /** 状态变更后使位置缓存失效并请求重绘。 */
  private invalidatePositions(): void {
    this.deps.renderer.getMarkerManager().clearPositionCache()
    this.deps.scheduleDraw()
  }
}
