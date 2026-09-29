import type { RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import type { Renderer } from '@/rendering/render/Renderer.js'
import type { Layer } from '@/rendering/scene/types.js'
import { createCustomMarkersRenderer } from '../../renderers/customMarkers.js'

/**
 * 自定义标记 Layer（绘制到所有 pane）。
 * 绘制体 `createCustomMarkersRenderer().draw` 在迁移批中改为直接返回 Layer；本包装层临时桥接旧契约。
 */
export function createCustomMarkersLayer(
  getContext: () => RenderContext | null,
  getSceneRenderer: () => Renderer,
): Layer<RenderContext> {
  return {
    id: 'plugin:customMarkers',
    role: 'overlay',
    pane: 'global',
    z: RENDERER_PRIORITY.OVERLAY,
    visible: true,
    paint() {
      const context = getContext()
      if (!context) return
      context.sceneRenderer = getSceneRenderer()
      createCustomMarkersRenderer().draw(context)
    },
    dispose() {},
  }
}
