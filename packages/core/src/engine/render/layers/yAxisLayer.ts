import type { RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import type { Renderer } from '@/rendering/render/Renderer.js'
import type { Layer } from '@/rendering/scene/types.js'
import {
  createYAxisOverlayRendererPlugin,
  createYAxisStaticRendererPlugin,
} from '../../renderers/yAxis.js'

/** Y 轴 Layer 选项。 */
export interface YAxisLayerOptions {
  axisWidth: number
  yPaddingPx: number
  getCrosshair: () => { y: number; price: number; activePaneId: string | null } | null
}

/** Y 轴静态层（刻度），main 级刷新。 */
export function createYAxisStaticLayer(
  options: YAxisLayerOptions,
  getContext: () => RenderContext | null,
  getSceneRenderer: () => Renderer,
): Layer<RenderContext> {
  return {
    id: 'plugin:yAxis',
    role: 'background',
    pane: 'global',
    z: RENDERER_PRIORITY.SYSTEM_YAXIS,
    visible: true,
    paint() {
      const context = getContext()
      if (!context) return
      context.sceneRenderer = getSceneRenderer()
      createYAxisStaticRendererPlugin(options).draw(context)
    },
    dispose() {},
  }
}

/** Y 轴动态层（标签 + 十字线价签），overlay 级刷新。 */
export function createYAxisOverlayLayer(
  options: YAxisLayerOptions,
  getContext: () => RenderContext | null,
  getSceneRenderer: () => Renderer,
): Layer<RenderContext> {
  return {
    id: 'plugin:yAxisOverlay',
    role: 'overlay',
    pane: 'global',
    z: RENDERER_PRIORITY.SYSTEM_CROSSHAIR,
    visible: true,
    paint() {
      const context = getContext()
      if (!context) return
      context.sceneRenderer = getSceneRenderer()
      createYAxisOverlayRendererPlugin(options).draw(context)
    },
    dispose() {},
  }
}
