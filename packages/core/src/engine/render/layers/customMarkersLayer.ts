import type { RenderContext } from '@/foundation/plugin/index.js'
import { createLayerFromPlugin } from '@/rendering/scene/createLayerFromPlugin.js'
import type { Layer } from '@/rendering/scene/types.js'
import { createCustomMarkersRenderer } from '../../renderers/customMarkers.js'

export function createCustomMarkersLayer(getContext: () => RenderContext | null): Layer {
  return createLayerFromPlugin(createCustomMarkersRenderer(), getContext, 'global')
}
