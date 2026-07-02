import type { RenderContext } from '../../../plugin'
import { createLayerFromPlugin } from '../../../scene/createLayerFromPlugin'
import type { Layer } from '../../../scene/types'
import { createCrosshairRendererPlugin } from '../../renderers/crosshair'

export function createCrosshairLayer(
  options: {
    getCrosshairState: () => {
      pos: { x: number; y: number } | null
      activePaneId: string | null
      isDragging: boolean
      price: number | null
    }
  },
  getContext: () => RenderContext | null,
): Layer {
  return createLayerFromPlugin(createCrosshairRendererPlugin(options), getContext, 'global')
}
