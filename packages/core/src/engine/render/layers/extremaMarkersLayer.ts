import type { RenderContext } from '../../../foundation/plugin/index'
import { createLayerFromPlugin } from '../../../rendering/scene/createLayerFromPlugin'
import type { Layer } from '../../../rendering/scene/types'
import { createExtremaMarkersRendererPlugin } from '../../renderers/extremaMarkers'

export function createExtremaMarkersLayer(getContext: () => RenderContext | null): Layer {
  return createLayerFromPlugin(createExtremaMarkersRendererPlugin(), getContext, 'global')
}
