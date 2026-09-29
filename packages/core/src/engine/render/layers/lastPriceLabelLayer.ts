import type { RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import type { Renderer } from '@/rendering/render/Renderer.js'
import type { Layer } from '@/rendering/scene/types.js'
import { createLastPriceLabelRegistrarPlugin } from '../../renderers/lastPrice.js'

/**
 * 最新价标签 Layer。
 * 绘制体在迁移批中改为直接返回 Layer；本包装层临时桥接旧契约。
 */
export function createLastPriceLabelLayer(
  getContext: () => RenderContext | null,
  getSceneRenderer: () => Renderer,
): Layer<RenderContext> {
  return {
    id: 'plugin:lastPriceLabel',
    role: 'overlay',
    pane: 'main',
    z: RENDERER_PRIORITY.LAST_PRICE_LABEL,
    visible: true,
    paint() {
      const context = getContext()
      if (!context) return
      context.sceneRenderer = getSceneRenderer()
      createLastPriceLabelRegistrarPlugin().draw(context)
    },
    dispose() {},
  }
}
