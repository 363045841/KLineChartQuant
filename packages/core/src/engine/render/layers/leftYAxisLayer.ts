import type { RenderContext } from '@/foundation/plugin/index.js'
import type { Layer } from '@/rendering/scene/types.js'
import {
  createLeftYAxisOverlayRendererLayer,
  createLeftYAxisStaticRendererLayer,
} from '../../renderers/leftYAxis.js'

/** 左 Y 轴 Layer 选项。 */
export interface LeftYAxisLayerOptions {
  axisWidth: number
  yPaddingPx: number
  getCrosshair: () => { y: number; price: number; activePaneId: string | null } | null
}

/** 左 Y 轴静态层（刻度），main 级刷新。 */
export function createLeftYAxisStaticLayer(options: LeftYAxisLayerOptions): Layer<RenderContext> {
  return createLeftYAxisStaticRendererLayer(options)
}

/** 左 Y 轴动态层（十字线价签），overlay 级刷新。 */
export function createLeftYAxisOverlayLayer(options: LeftYAxisLayerOptions): Layer<RenderContext> {
  return createLeftYAxisOverlayRendererLayer(options)
}
