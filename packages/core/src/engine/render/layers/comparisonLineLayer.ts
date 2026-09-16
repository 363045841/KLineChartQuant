import type { RenderContext } from '../../../foundation/plugin/index.js'
import { createLayerFromPlugin } from '../../../rendering/scene/createLayerFromPlugin.js'
import type { Layer } from '../../../rendering/scene/types.js'
import { createComparisonLineRenderer } from '../../renderers/comparisonLine.js'

export function createComparisonLineLayer(getContext: () => RenderContext | null): Layer {
  const plugin = createComparisonLineRenderer()
  return createLayerFromPlugin(plugin, getContext, 'main')
}
