import type { RenderContext } from '@/foundation/plugin/index.js'
import { createLayerFromPlugin } from '@/rendering/scene/createLayerFromPlugin.js'
import type { Layer } from '@/rendering/scene/types.js'
import { createExtremaMarkersRendererPlugin } from '../../renderers/extremaMarkers.js'

export function createExtremaMarkersLayer(getContext: () => RenderContext | null): Layer {
  return createLayerFromPlugin(createExtremaMarkersRendererPlugin(), getContext, 'global')
}
