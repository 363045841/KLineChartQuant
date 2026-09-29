/**
 * 迁移期桥接 helper：把旧式 `RendererPlugin` 包装为原生 `Layer`。
 *
 * 这是给尚未迁移的渲染器（副图 scale、paneTitle、指标等）提供的临时入口；
 * 每个渲染器迁移为直接返回 Layer 后即可删除对应调用，最终删除本文件。
 */

import type { RenderContext, RendererPlugin } from '@/foundation/plugin/index.js'
import type { Renderer } from '@/rendering/render/Renderer.js'
import type { Layer, LayerPane, LayerRole } from '@/rendering/scene/types.js'

/** 包装参数：声明 Layer 身份与帧上下文读取方式。 */
export interface WrapRendererAsLayerOptions {
  id: string
  role: LayerRole
  pane: LayerPane
  z: number
  getContext: () => RenderContext | null
  getSceneRenderer: () => Renderer
  /** 初始可见性，缺省 true。 */
  visible?: boolean
  /** 卸载回调；缺省转发 plugin.onUninstall。 */
  onDispose?: () => void
}

/**
 * 将 `RendererPlugin.draw` 桥接为一个 Layer。
 * 与旧 `createLayerFromPlugin` 不同：pane 归属由调用方显式声明，Scene 负责过滤。
 */
export function wrapRendererAsLayer(
  plugin: RendererPlugin,
  options: WrapRendererAsLayerOptions,
): Layer<RenderContext> {
  return {
    id: options.id,
    role: options.role,
    pane: options.pane,
    z: options.z,
    visible: options.visible ?? plugin.enabled !== false,
    paint() {
      const context = options.getContext()
      if (!context) return
      // 注入本帧渲染后端，已迁路径走统一 GPU 画笔，未迁路径仍用 context.ctx
      context.sceneRenderer = options.getSceneRenderer()
      plugin.draw(context)
    },
    dispose() {
      if (options.onDispose) {
        options.onDispose()
        return
      }
      plugin.onUninstall?.()
    },
  }
}
