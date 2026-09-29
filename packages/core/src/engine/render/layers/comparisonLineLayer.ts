import type { RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import type { Renderer } from '@/rendering/render/Renderer.js'
import type { Layer } from '@/rendering/scene/types.js'
import { createComparisonLineRenderer } from '../../renderers/comparisonLine.js'

/**
 * 比较视图折线 Layer。
 * 绘制体 `createComparisonLineRenderer().draw` 在迁移批中改为直接返回 Layer；本包装层临时桥接旧契约。
 */
export function createComparisonLineLayer(
  getContext: () => RenderContext | null,
  getSceneRenderer: () => Renderer,
): Layer<RenderContext> {
  return {
    id: 'plugin:comparisonLine',
    role: 'primary',
    pane: 'main',
    z: RENDERER_PRIORITY.MAIN + 2,
    visible: true,
    paint() {
      const context = getContext()
      if (!context) return
      context.sceneRenderer = getSceneRenderer()
      createComparisonLineRenderer().draw(context)
    },
    dispose() {},
  }
}
