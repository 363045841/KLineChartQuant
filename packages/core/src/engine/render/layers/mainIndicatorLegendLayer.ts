import type {
  RenderContext,
  RendererPluginWithHost,
} from '../../../foundation/plugin/index'
import { createLayerFromPlugin } from '../../../rendering/scene/createLayerFromPlugin'
import type { Layer } from '../../../rendering/scene/types'
import {
  createMainIndicatorLegendRendererPlugin,
  type MainIndicatorLegendOptions,
} from '../../renderers/Indicator/mainIndicatorLegend'

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
