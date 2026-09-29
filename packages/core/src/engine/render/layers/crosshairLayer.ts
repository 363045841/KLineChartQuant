import type { RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import type { Renderer } from '@/rendering/render/Renderer.js'
import type { Layer } from '@/rendering/scene/types.js'
import { createCrosshairRendererPlugin } from '../../renderers/crosshair.js'

/** 十字线状态读取器：由 ChartRenderer 注入交互控制器。 */
export interface CrosshairLayerOptions {
  getCrosshairState: () => {
    pos: { x: number; y: number } | null
    activePaneId: string | null
    isDragging: boolean
    price: number | null
  }
}

/**
 * 十字线 Layer（绘制到所有 pane）。
 * 绘制体 `createCrosshairRendererPlugin().draw` 在迁移批中改为直接返回 Layer；本包装层临时桥接旧契约。
 */
export function createCrosshairLayer(
  options: CrosshairLayerOptions,
  getContext: () => RenderContext | null,
  getSceneRenderer: () => Renderer,
): Layer<RenderContext> {
  return {
    id: 'plugin:crosshair',
    role: 'overlay',
    pane: 'global',
    z: RENDERER_PRIORITY.SYSTEM_CROSSHAIR,
    visible: true,
    paint() {
      const context = getContext()
      if (!context) return
      context.sceneRenderer = getSceneRenderer()
      createCrosshairRendererPlugin(options).draw(context)
    },
    dispose() {},
  }
}
