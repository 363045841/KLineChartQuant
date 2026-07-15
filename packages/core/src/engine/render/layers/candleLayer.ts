import type { RenderContext } from '../../../foundation/plugin/index'
import { createLayerFromPlugin } from '../../../rendering/scene/createLayerFromPlugin'
import type { Layer } from '../../../rendering/scene/types'
import { createCandleRenderer } from '../../renderers/candle'

export function createCandleLayer(getContext: () => RenderContext | null): Layer {
  const plugin = createCandleRenderer()
  return createLayerFromPlugin(plugin, getContext, 'main')
}
