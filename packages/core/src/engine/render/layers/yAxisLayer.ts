import type { RenderContext } from '@/foundation/plugin/index.js'
import type { Layer } from '@/rendering/scene/types.js'
import {
  createYAxisOverlayRendererLayer,
  createYAxisStaticRendererLayer,
} from '../../renderers/yAxis.js'

/** Y 轴 Layer 选项。 */
export interface YAxisLayerOptions {
  axisWidth: number
  yPaddingPx: number
  getCrosshair: () => { y: number; price: number; activePaneId: string | null } | null
}

/** Y 轴静态层（刻度），main 级刷新。 */
export function createYAxisStaticLayer(options: YAxisLayerOptions): Layer<RenderContext> {
  return createYAxisStaticRendererLayer(options)
}

/** Y 轴动态层（标签 + 十字线价签），overlay 级刷新。 */
export function createYAxisOverlayLayer(options: YAxisLayerOptions): Layer<RenderContext> {
  return createYAxisOverlayRendererLayer(options)
}
