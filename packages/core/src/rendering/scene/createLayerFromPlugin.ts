/** 将旧式 RendererPlugin 适配为由 Scene 调度的 Layer。 */

import { RENDERER_PRIORITY } from '../../foundation/plugin/index'
import type { RendererPlugin, RenderContext } from '../../foundation/plugin/index'

import type { Layer, LayerRole, PaintContext, PaneRole } from './types'
import { makePluginLayerId } from '../../foundation/plugin/rendererLayerId'

export function createLayerFromPlugin(
  plugin: RendererPlugin,
  getContext: () => RenderContext | null,
  targetPaneId: string,
): Layer {
  const paneRole: PaneRole =
    targetPaneId === 'main' ? 'main' : targetPaneId === 'global' ? 'global' : 'sub'
  let visible = plugin.enabled !== false

  return {
    id: makePluginLayerId(plugin.name),
    role: pluginPriorityToRole(plugin.priority, plugin),
    paneRole,
    z: plugin.priority,
    get visible() {
      return visible
    },
    set visible(v: boolean) {
      visible = v
    },
    /**
     * @Todo 兼容层：把旧 RendererPlugin.draw 包装成 Layer.paint。
     */
    paint(ctx: PaintContext) {
      if (!visible) return
      // 子图 layer 只画自己的 pane
      if (paneRole === 'sub' && ctx.paneId !== targetPaneId) return
      // 获取业务层 RenderContext（含数据、几何、2D ctx）
      const context = getContext()
      if (!context) return
      // 注入本帧 sceneRenderer，已迁路径走统一 GPU 画笔，未迁路径仍用 context.ctx
      context.sceneRenderer = ctx.renderer
      try {
        // 调用各个渲染器的绘制能力
        plugin.draw(context)
      } catch (e) {
        // 异常隔离，不中断同 pane 后续 layer
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
