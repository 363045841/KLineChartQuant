import type { RenderContext } from '../../../foundation/plugin/index'
import { createLayerFromPlugin } from '../../../rendering/scene/createLayerFromPlugin'
import type { Layer } from '../../../rendering/scene/types'
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
