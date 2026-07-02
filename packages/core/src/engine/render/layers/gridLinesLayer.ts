import type { RenderContext } from '../../../plugin'
import { createLayerFromPlugin } from '../../../scene/createLayerFromPlugin'
import type { Layer } from '../../../scene/types'
import { createGridLinesRendererPlugin } from '../../renderers/gridLines'

export function createGridLinesLayer(getContext: () => RenderContext | null): Layer {
  return createLayerFromPlugin(createGridLinesRendererPlugin(), getContext, 'global')
}
