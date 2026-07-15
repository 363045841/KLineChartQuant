import type { RenderContext } from '../../../foundation/plugin/index'
import { createLayerFromPlugin } from '../../../rendering/scene/createLayerFromPlugin'
import type { Layer } from '../../../rendering/scene/types'
import { createLeftYAxisRendererPlugin } from '../../renderers/leftYAxis'

export function createLeftYAxisLayer(
  options: {
    axisWidth: number
    yPaddingPx: number
    getCrosshair: () => { y: number; price: number; activePaneId: string | null } | null
  },
  getContext: () => RenderContext | null,
): Layer {
  return createLayerFromPlugin(createLeftYAxisRendererPlugin(options), getContext, 'global')
}
