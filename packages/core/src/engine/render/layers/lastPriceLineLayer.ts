import type { RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import type { Renderer } from '@/rendering/render/Renderer.js'
import type { Layer } from '@/rendering/scene/types.js'
import { createLastPriceLineRendererPlugin } from '../../renderers/lastPrice.js'

/**
 * 最新价线 Layer。
 * 绘制体在迁移批中改为直接返回 Layer；本包装层临时桥接旧契约。
 */
export function createLastPriceLineLayer(
  getContext: () => RenderContext | null,
  getSceneRenderer: () => Renderer,
): Layer<RenderContext> {
  const plugin = createLastPriceLineRendererPlugin()
  return {
    id: 'plugin:lastPriceLine',
    role: 'primary',
    pane: 'main',
    z: RENDERER_PRIORITY.FOREGROUND,
    visible: true,
    paint() {
      const context = getContext()
      if (!context) return
      context.sceneRenderer = getSceneRenderer()
      plugin.draw(context)
    },
    dispose() {},
  }
}
