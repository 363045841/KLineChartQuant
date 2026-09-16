import type { RenderContext } from '../../../foundation/plugin/index.js'
import { createLayerFromPlugin } from '../../../rendering/scene/createLayerFromPlugin.js'
import type { Layer } from '../../../rendering/scene/types.js'
import { createCrosshairRendererPlugin } from '../../renderers/crosshair.js'

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
