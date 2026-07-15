import type { RenderContext } from '../../../foundation/plugin/index'
import { createLayerFromPlugin } from '../../../rendering/scene/createLayerFromPlugin'
import type { Layer } from '../../../rendering/scene/types'
import { createLastPriceLabelRegistrarPlugin } from '../../renderers/lastPrice'

export function createLastPriceLabelLayer(getContext: () => RenderContext | null): Layer {
  return createLayerFromPlugin(createLastPriceLabelRegistrarPlugin(), getContext, 'main')
}
