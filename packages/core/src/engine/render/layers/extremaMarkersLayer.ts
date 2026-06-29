import { createLayerFromPlugin } from '../../../scene/createLayerFromPlugin'
import type { Layer } from '../../../scene/types'
import type { RenderContext } from '../../../plugin'
import { createExtremaMarkersRendererPlugin } from '../../renderers/extremaMarkers'

export function createExtremaMarkersLayer(
  getContext: () => RenderContext | null,
): Layer {
  return createLayerFromPlugin(createExtremaMarkersRendererPlugin(), getContext, 'global')
}
