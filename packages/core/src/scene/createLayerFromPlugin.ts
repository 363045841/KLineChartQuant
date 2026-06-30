import { RENDERER_PRIORITY } from '../plugin'
import type { RendererPlugin, RenderContext } from '../plugin'
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
      plugin.draw(context)
    },
    dispose() {
      plugin.onUninstall?.()
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
