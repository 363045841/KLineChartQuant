import type { RenderContext } from '../../../plugin'
import { createLayerFromPlugin } from '../../../scene/createLayerFromPlugin'
import type { Layer } from '../../../scene/types'
import { createExtremaMarkersRendererPlugin } from '../../renderers/extremaMarkers'

export function createExtremaMarkersLayer(getContext: () => RenderContext | null): Layer {
  return createLayerFromPlugin(createExtremaMarkersRendererPlugin(), getContext, 'global')
}
