import type { RenderContext } from '@/foundation/plugin/index.js'
import { createLayerFromPlugin } from '@/rendering/scene/createLayerFromPlugin.js'
import type { Layer } from '@/rendering/scene/types.js'
import { createCandleRenderer } from '../../renderers/candle.js'

export function createCandleLayer(getContext: () => RenderContext | null): Layer {
  const plugin = createCandleRenderer()
  return createLayerFromPlugin(plugin, getContext, 'main')
}
