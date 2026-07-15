import type { RenderContext } from '../../../foundation/plugin/index'
import { createLayerFromPlugin } from '../../../rendering/scene/createLayerFromPlugin'
import type { Layer } from '../../../rendering/scene/types'
import { createGridLinesRendererPlugin } from '../../renderers/gridLines'

export function createGridLinesLayer(getContext: () => RenderContext | null): Layer {
  return createLayerFromPlugin(createGridLinesRendererPlugin(), getContext, 'global')
}
