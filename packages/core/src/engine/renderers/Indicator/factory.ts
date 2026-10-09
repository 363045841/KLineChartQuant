/**
 * 指标渲染器 Layer 工厂。
 *
 * 指标定义的 `rendererFactory` 现已直接返回原生 `Layer`；本工厂只承担
 * 「按显式 role 覆盖渲染器推导的 role」这一处职责。
 */

import type { RenderContext } from '@/foundation/plugin/index.js'
import type { Layer } from '@/rendering/scene/types.js'
import type { IndicatorMetadata } from '../../indicators/indicatorMetadata.js'
import type { IndicatorRendererOptions } from './index.js'

/** createIndicatorLayer 选项：指标渲染器参数 + 目标 role。 */
export interface IndicatorLayerOptions extends IndicatorRendererOptions {
  definition: IndicatorMetadata
  /** 显式 Layer role；缺省沿用渲染器按 pane 推导的结果（main → primary）。 */
  role?: Layer['role']
}

/**
 * 由指标定义创建 Layer。
 * 主图与副图共用定义工厂，名称由目录统一解析。
 */
export function createIndicatorLayer(options: IndicatorLayerOptions): Layer<RenderContext> {
  const { definition, role } = options
  const layer = definition.rendererFactory({
    paneId: options.paneId,
    indicatorId: options.indicatorId,
    instanceId: options.instanceId,
    params: options.params,
  })
  return role && role !== layer.role ? { ...layer, role } : layer
}
