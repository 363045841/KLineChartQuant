import type { RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import type { Renderer } from '@/rendering/render/Renderer.js'
import type { Layer } from '@/rendering/scene/types.js'
import {
  createLeftYAxisOverlayRendererPlugin,
  createLeftYAxisStaticRendererPlugin,
} from '../../renderers/leftYAxis.js'

/** 左 Y 轴 Layer 选项。 */
export interface LeftYAxisLayerOptions {
  axisWidth: number
  yPaddingPx: number
  getCrosshair: () => { y: number; price: number; activePaneId: string | null } | null
}

/** 左 Y 轴静态层（刻度），main 级刷新。 */
export function createLeftYAxisStaticLayer(
  options: LeftYAxisLayerOptions,
  getContext: () => RenderContext | null,
  getSceneRenderer: () => Renderer,
): Layer<RenderContext> {
  return {
    id: 'plugin:leftYAxis',
    role: 'background',
    pane: 'global',
    z: RENDERER_PRIORITY.SYSTEM_YAXIS,
    visible: true,
    paint() {
      const context = getContext()
      if (!context) return
      context.sceneRenderer = getSceneRenderer()
      createLeftYAxisStaticRendererPlugin(options).draw(context)
    },
    dispose() {},
  }
}

/** 左 Y 轴动态层（十字线价签），overlay 级刷新。 */
export function createLeftYAxisOverlayLayer(
  options: LeftYAxisLayerOptions,
  getContext: () => RenderContext | null,
  getSceneRenderer: () => Renderer,
): Layer<RenderContext> {
  return {
    id: 'plugin:leftYAxisOverlay',
    role: 'overlay',
    pane: 'global',
    z: RENDERER_PRIORITY.SYSTEM_CROSSHAIR,
    visible: true,
    paint() {
      const context = getContext()
      if (!context) return
      context.sceneRenderer = getSceneRenderer()
      createLeftYAxisOverlayRendererPlugin(options).draw(context)
    },
    dispose() {},
  }
}
