import type { RenderContext } from '../../../foundation/plugin/index'
import { createLayerFromPlugin } from '../../../rendering/scene/createLayerFromPlugin'
import type { Layer } from '../../../rendering/scene/types'
import { createComparisonLineRenderer } from '../../renderers/comparisonLine'

export function createComparisonLineLayer(getContext: () => RenderContext | null): Layer {
  const plugin = createComparisonLineRenderer()
  return createLayerFromPlugin(plugin, getContext, 'main')
}
