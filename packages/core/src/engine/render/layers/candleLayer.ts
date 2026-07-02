import type { RenderContext } from '../../../plugin'
import { createLayerFromPlugin } from '../../../scene/createLayerFromPlugin'
import type { Layer } from '../../../scene/types'
import { createCandleRenderer } from '../../renderers/candle'

export function createCandleLayer(getContext: () => RenderContext | null): Layer {
  const plugin = createCandleRenderer()
  return createLayerFromPlugin(plugin, getContext, 'main')
}
