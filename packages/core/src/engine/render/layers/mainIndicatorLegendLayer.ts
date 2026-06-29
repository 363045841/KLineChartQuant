import { createLayerFromPlugin } from '../../../scene/createLayerFromPlugin'
import type { Layer } from '../../../scene/types'
import type { RenderContext, PluginHost } from '../../../plugin'
import { createMainIndicatorLegendRendererPlugin } from '../../renderers/Indicator/mainIndicatorLegend'

export function createMainIndicatorLegendLayer(
  config: { yPaddingPx: number },
  getContext: () => RenderContext | null,
  pluginHost: PluginHost,
): Layer {
  const plugin = createMainIndicatorLegendRendererPlugin(config)
  try {
    plugin.onInstall?.(pluginHost)
  } catch (e) {
    console.error(`[MainIndicatorLegendLayer] onInstall error:`, e)
  }
  return createLayerFromPlugin(plugin, getContext, 'main')
}
