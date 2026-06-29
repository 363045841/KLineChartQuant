import { createLayerFromPlugin } from '../../../scene/createLayerFromPlugin'
import type { Layer } from '../../../scene/types'
import type { RenderContext } from '../../../plugin'
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
