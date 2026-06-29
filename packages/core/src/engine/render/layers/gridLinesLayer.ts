import { createLayerFromPlugin } from '../../../scene/createLayerFromPlugin'
import type { Layer } from '../../../scene/types'
import type { RenderContext } from '../../../plugin'
import { createGridLinesRendererPlugin } from '../../renderers/gridLines'

export function createGridLinesLayer(
  getContext: () => RenderContext | null,
): Layer {
  return createLayerFromPlugin(createGridLinesRendererPlugin(), getContext, 'global')
}
