import { RENDERER_PRIORITY } from '../../foundation/plugin/index'
import type { RendererPlugin, RenderContext } from '../../foundation/plugin/index'

import type { Layer, LayerRole, PaintContext, PaneRole } from './types'

export function createLayerFromPlugin(
  plugin: RendererPlugin,
  getContext: () => RenderContext | null,
  targetPaneId: string,
): Layer {
  const paneRole: PaneRole =
    targetPaneId === 'main' ? 'main' : targetPaneId === 'global' ? 'global' : 'sub'
  let visible = plugin.enabled !== false

  return {
    id: `plugin:${plugin.name}`,
    role: pluginPriorityToRole(plugin.priority, plugin),
    paneRole,
    z: plugin.priority,
    get visible() {
      return visible
    },
    set visible(v: boolean) {
      visible = v
    },
    paint(ctx: PaintContext) {
      if (!visible) return
      // For sub-pane layers, skip if we're painting a different sub-pane
      if (paneRole === 'sub' && ctx.paneId !== targetPaneId) return
      const context = getContext()
      if (!context) return
      // 注入本帧 Scene Renderer，供已迁路径（candle 等）走统一画笔
      context.sceneRenderer = ctx.renderer
      try {
        plugin.draw(context)
      } catch (e) {
        // 隔离单层异常，避免中断同 pane 后续 Layer（对齐旧 Manager.render）
        console.error(`[RendererPlugin] ${plugin.name} draw error:`, e)
      }
    },
    dispose() {
      // onUninstall 由 removeRenderer / Manager.unregister 单点负责，避免双调
    },
  }
}

function pluginPriorityToRole(priority: number, plugin: RendererPlugin): LayerRole {
  if (plugin.layer === 'overlay') return 'overlay'
  if (priority <= RENDERER_PRIORITY.GRID || plugin.name === 'gridLines' || plugin.name === 'grid')
    return 'background'
  if (priority <= RENDERER_PRIORITY.INDICATOR && plugin.name !== 'candle') return 'indicator'
  if (plugin.name === 'candle' || plugin.name === 'comparisonLine') return 'primary'
  if (plugin.name.startsWith('drawing')) return 'drawing'
  return 'indicator'
}
