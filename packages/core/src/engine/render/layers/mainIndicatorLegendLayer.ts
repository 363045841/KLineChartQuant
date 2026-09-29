import type { PluginHostImpl, RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import type { Renderer } from '@/rendering/render/Renderer.js'
import type { Layer } from '@/rendering/scene/types.js'
import {
  createMainIndicatorLegendRendererPlugin,
  type MainIndicatorLegendOptions,
} from '../../renderers/Indicator/mainIndicatorLegend.js'

/**
 * 主图指标图例 Layer（覆盖层）。
 * 图例状态经显式注入读取，不再依赖 RendererPlugin 的 config/生命周期机制。
 */
export function createMainIndicatorLegendLayer(
  config: MainIndicatorLegendOptions,
  getContext: () => RenderContext | null,
  getSceneRenderer: () => Renderer,
  getPluginHost: () => PluginHostImpl,
): Layer<RenderContext> {
  const plugin = createMainIndicatorLegendRendererPlugin(config)
  plugin.onInstall?.(getPluginHost())
  return {
    id: 'plugin:mainIndicatorLegend',
    role: 'overlay',
    pane: 'main',
    z: RENDERER_PRIORITY.FOREGROUND,
    visible: true,
    paint() {
      const context = getContext()
      if (!context) return
      context.sceneRenderer = getSceneRenderer()
      plugin.draw(context)
    },
    dispose() {
      plugin.onUninstall?.()
    },
  }
}
