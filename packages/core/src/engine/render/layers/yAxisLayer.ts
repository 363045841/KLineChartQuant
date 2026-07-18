import type { RenderContext } from '../../../foundation/plugin/index'
import { createLayerFromPlugin } from '../../../rendering/scene/createLayerFromPlugin'
import type { Layer } from '../../../rendering/scene/types'
import {
  createYAxisOverlayRendererPlugin,
  createYAxisStaticRendererPlugin,
} from '../../renderers/yAxis'

type YAxisLayerOptions = {
  axisWidth: number
  yPaddingPx: number
  getCrosshair: () => { y: number; price: number; activePaneId: string | null } | null
}

/** Y 轴静态层（刻度），main canvas 级刷新 */
export function createYAxisStaticLayer(
  options: YAxisLayerOptions,
  getContext: () => RenderContext | null,
): Layer {
  return createLayerFromPlugin(createYAxisStaticRendererPlugin(options), getContext, 'global')
}

/** Y 轴动态层（标签 + 十字线价签），overlay 级刷新 */
export function createYAxisOverlayLayer(
  options: YAxisLayerOptions,
  getContext: () => RenderContext | null,
): Layer {
  return createLayerFromPlugin(createYAxisOverlayRendererPlugin(options), getContext, 'global')
}

/** @deprecated 使用 createYAxisStaticLayer */
export function createYAxisLayer(
  options: YAxisLayerOptions,
  getContext: () => RenderContext | null,
): Layer {
  return createYAxisStaticLayer(options, getContext)
}
