import { createLayerFromPlugin } from '../../../scene/createLayerFromPlugin'
import type { Layer } from '../../../scene/types'
import type { RenderContext } from '../../../plugin'
import { createCustomMarkersRenderer } from '../../renderers/customMarkers'

export function createCustomMarkersLayer(
  getContext: () => RenderContext | null,
): Layer {
  return createLayerFromPlugin(createCustomMarkersRenderer(), getContext, 'global')
}
