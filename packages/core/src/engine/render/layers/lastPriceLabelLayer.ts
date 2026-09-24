import type { RenderContext } from '@/foundation/plugin/index.js'
import { createLayerFromPlugin } from '@/rendering/scene/createLayerFromPlugin.js'
import type { Layer } from '@/rendering/scene/types.js'
import { createLastPriceLabelRegistrarPlugin } from '../../renderers/lastPrice.js'

export function createLastPriceLabelLayer(getContext: () => RenderContext | null): Layer {
  return createLayerFromPlugin(createLastPriceLabelRegistrarPlugin(), getContext, 'main')
}
