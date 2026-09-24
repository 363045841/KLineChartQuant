import type { RenderContext } from '@/foundation/plugin/index.js'
import { createLayerFromPlugin } from '@/rendering/scene/createLayerFromPlugin.js'
import type { Layer } from '@/rendering/scene/types.js'
import {
  createLeftYAxisOverlayRendererPlugin,
  createLeftYAxisStaticRendererPlugin,
} from '../../renderers/leftYAxis.js'

type LeftYAxisLayerOptions = {
  axisWidth: number
  yPaddingPx: number
  getCrosshair: () => { y: number; price: number; activePaneId: string | null } | null
}

/** 左 Y 轴静态层（刻度），main canvas 级刷新 */
export function createLeftYAxisStaticLayer(
  options: LeftYAxisLayerOptions,
  getContext: () => RenderContext | null,
): Layer {
  return createLayerFromPlugin(createLeftYAxisStaticRendererPlugin(options), getContext, 'global')
}

/** 左 Y 轴动态层（十字线价签），overlay 级刷新 */
export function createLeftYAxisOverlayLayer(
  options: LeftYAxisLayerOptions,
  getContext: () => RenderContext | null,
): Layer {
  return createLayerFromPlugin(createLeftYAxisOverlayRendererPlugin(options), getContext, 'global')
}

/** @deprecated 使用 createLeftYAxisStaticLayer */
export function createLeftYAxisLayer(
  options: LeftYAxisLayerOptions,
  getContext: () => RenderContext | null,
): Layer {
  return createLeftYAxisStaticLayer(options, getContext)
}
