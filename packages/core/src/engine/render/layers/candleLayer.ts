import type { RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import type { Renderer } from '@/rendering/render/Renderer.js'
import type { Layer } from '@/rendering/scene/types.js'
import { createCandleRenderer } from '../../renderers/candle.js'

/**
 * K 线主体 Layer。
 * 绘制体 `createCandleRenderer().draw` 在迁移批中改为直接返回 Layer；本包装层临时桥接旧契约。
 */
export function createCandleLayer(
  getContext: () => RenderContext | null,
  getSceneRenderer: () => Renderer,
): Layer<RenderContext> {
  return {
    id: 'plugin:candle',
    role: 'primary',
    pane: 'main',
    z: RENDERER_PRIORITY.MAIN,
    visible: true,
    paint() {
      const context = getContext()
      if (!context) return
      context.sceneRenderer = getSceneRenderer()
      createCandleRenderer().draw(context)
    },
    dispose() {},
  }
}
