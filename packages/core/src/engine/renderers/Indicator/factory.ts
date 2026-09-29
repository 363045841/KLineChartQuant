/**
 * 指标渲染器 Layer 工厂。
 *
 * 指标定义的 `rendererFactory` 目前仍返回旧式 `RendererPlugin`；本工厂把它
 * 桥接为原生 `Layer`，并集中处理「pane 归属 / role / z / 帧上下文注入」。
 * 渲染器工厂迁为直接返回 Layer 后，本桥接即可删除。
 */

import { makePluginLayerId } from '@/foundation/plugin/impl/rendererLayerId.js'
import type { RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import type { Renderer } from '@/rendering/render/Renderer.js'
import type { Layer } from '@/rendering/scene/types.js'
import type { IndicatorMetadata } from '../../indicators/indicatorMetadata.js'
import { wrapRendererAsLayer } from '../../render/layers/wrapRendererAsLayer.js'
import type { IndicatorRendererOptions } from './index.js'

/** createIndicatorLayer 选项：指标渲染器参数 + 帧上下文注入。 */
export interface IndicatorLayerOptions extends IndicatorRendererOptions {
  definition: IndicatorMetadata
  getContext: () => RenderContext | null
  getSceneRenderer: () => Renderer
  /** Layer role，缺省 indicator（主图指标为 primary）。 */
  role?: Layer['role']
}

/**
 * 由指标定义创建 Layer。
 * 主图指标用 `mainPane.rendererName`，副图指标用 `definition.rendererFactory`。
 */
export function createIndicatorLayer(options: IndicatorLayerOptions): Layer<RenderContext> {
  const { definition, getContext, getSceneRenderer } = options
  const plugin = definition.rendererFactory({
    paneId: options.paneId,
    indicatorId: options.indicatorId,
    instanceId: options.instanceId,
    params: options.params,
    getContext,
    getSceneRenderer,
  })
  return wrapRendererAsLayer(plugin, {
    id: makePluginLayerId(plugin.name),
    role: options.role ?? 'indicator',
    pane: options.paneId,
    z: RENDERER_PRIORITY.INDICATOR,
    getContext,
    getSceneRenderer,
  })
}
