import { createLayerFromPlugin } from '../../../scene/createLayerFromPlugin'
import type { Layer } from '../../../scene/types'
import type { RenderContext } from '../../../plugin'
import { createLastPriceLabelRegistrarPlugin } from '../../renderers/lastPrice'

export function createLastPriceLabelLayer(
  getContext: () => RenderContext | null,
): Layer {
  return createLayerFromPlugin(createLastPriceLabelRegistrarPlugin(), getContext, 'main')
}
