import type { RenderContext } from '@/foundation/plugin/index.js'
import { createLayerFromPlugin } from '@/rendering/scene/createLayerFromPlugin.js'
import type { Layer } from '@/rendering/scene/types.js'
import { createLastPriceLineRendererPlugin } from '../../renderers/lastPrice.js'

export function createLastPriceLineLayer(getContext: () => RenderContext | null): Layer {
  const plugin = createLastPriceLineRendererPlugin()
  return createLayerFromPlugin(plugin, getContext, 'main')
}
