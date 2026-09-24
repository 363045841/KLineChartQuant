import type { RenderContext, RendererPluginWithHost } from '@/foundation/plugin/index.js'
import { createLayerFromPlugin } from '@/rendering/scene/createLayerFromPlugin.js'
import type { Layer } from '@/rendering/scene/types.js'
import {
  createMainIndicatorLegendRendererPlugin,
  type MainIndicatorLegendOptions,
} from '../../renderers/Indicator/mainIndicatorLegend.js'

export function createMainIndicatorLegendLayer(
  config: MainIndicatorLegendOptions,
  getContext: () => RenderContext | null,
): { layer: Layer; plugin: RendererPluginWithHost } {
  const plugin = createMainIndicatorLegendRendererPlugin(config)
  return {
    layer: createLayerFromPlugin(plugin, getContext, 'main'),
    plugin,
  }
}
