import type { RenderContext } from '../../../foundation/plugin/index'
import { createLayerFromPlugin } from '../../../rendering/scene/createLayerFromPlugin'
import type { Layer } from '../../../rendering/scene/types'
import { createCustomMarkersRenderer } from '../../renderers/customMarkers'

export function createCustomMarkersLayer(getContext: () => RenderContext | null): Layer {
  return createLayerFromPlugin(createCustomMarkersRenderer(), getContext, 'global')
}
