import type { RenderContext } from '../../../foundation/plugin/index'
import { createLayerFromPlugin } from '../../../rendering/scene/createLayerFromPlugin'
import type { Layer } from '../../../rendering/scene/types'
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
