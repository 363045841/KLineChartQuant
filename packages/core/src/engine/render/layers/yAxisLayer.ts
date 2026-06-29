import { createLayerFromPlugin } from '../../../scene/createLayerFromPlugin'
import type { Layer } from '../../../scene/types'
import type { RenderContext } from '../../../plugin'
import { createYAxisRendererPlugin } from '../../renderers/yAxis'

export function createYAxisLayer(
  options: {
    axisWidth: number
    yPaddingPx: number
    getCrosshair: () => { y: number; price: number; activePaneId: string | null } | null
  },
  getContext: () => RenderContext | null,
): Layer {
  return createLayerFromPlugin(createYAxisRendererPlugin(options), getContext, 'global')
}
