import type { RenderContext } from '../../../plugin'
import { createLayerFromPlugin } from '../../../scene/createLayerFromPlugin'
import type { Layer } from '../../../scene/types'
import { createComparisonLineRenderer } from '../../renderers/comparisonLine'

export function createComparisonLineLayer(getContext: () => RenderContext | null): Layer {
  const plugin = createComparisonLineRenderer()
  return createLayerFromPlugin(plugin, getContext, 'main')
}
