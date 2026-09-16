import type { RenderContext } from '../../../foundation/plugin/index.js'
import { createLayerFromPlugin } from '../../../rendering/scene/createLayerFromPlugin.js'
import type { Layer } from '../../../rendering/scene/types.js'
import { createGridLinesRendererPlugin } from '../../renderers/gridLines.js'

export function createGridLinesLayer(getContext: () => RenderContext | null): Layer {
  return createLayerFromPlugin(createGridLinesRendererPlugin(), getContext, 'global')
}
