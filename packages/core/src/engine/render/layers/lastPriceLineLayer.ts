import type { RenderContext } from '../../../foundation/plugin/index'
import { createLayerFromPlugin } from '../../../rendering/scene/createLayerFromPlugin'
import type { Layer } from '../../../rendering/scene/types'
import { createLastPriceLineRendererPlugin } from '../../renderers/lastPrice'

export function createLastPriceLineLayer(getContext: () => RenderContext | null): Layer {
  const plugin = createLastPriceLineRendererPlugin()
  return createLayerFromPlugin(plugin, getContext, 'main')
}
