import type { RenderContext } from '../../../plugin'
import { createLayerFromPlugin } from '../../../scene/createLayerFromPlugin'
import type { Layer } from '../../../scene/types'
import { createLastPriceLineRendererPlugin } from '../../renderers/lastPrice'

export function createLastPriceLineLayer(getContext: () => RenderContext | null): Layer {
  const plugin = createLastPriceLineRendererPlugin()
  return createLayerFromPlugin(plugin, getContext, 'main')
}
