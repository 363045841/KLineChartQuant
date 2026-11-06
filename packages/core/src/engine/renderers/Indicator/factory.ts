/**
 * 指标渲染器 Layer 工厂。
 *
 * 指标定义的 `rendererFactory` 现已直接返回原生 `Layer`；本工厂负责两处：
 * 按显式 role 覆盖 role，以及按 `visiblePeriods` 拦截不在当前周期内的绘制。
 */

import type { RenderContext } from '@/foundation/plugin/index.js'
import type { Layer } from '@/rendering/scene/types.js'
import type { IndicatorMetadata } from '../../indicators/indicatorMetadata.js'
import { isIndicatorVisibleOnPeriod } from '../../indicators/indicatorPeriodVisibility.js'
import type { IndicatorRendererOptions } from './index.js'

/** createIndicatorLayer 选项：指标渲染器参数 + 目标 role。 */
export interface IndicatorLayerOptions extends IndicatorRendererOptions {
  definition: IndicatorMetadata
  /** 显式 Layer role；缺省沿用渲染器按 pane 推导的结果（main → primary）。 */
  role?: Layer['role']
}

/** 该定义在当前周期是否应绘制；未声明可见范围时恒为真。 */
export function isLayerVisibleOnPeriod(definition: IndicatorMetadata, period: string): boolean {
  const ranges = definition.visiblePeriods
  if (ranges === undefined || ranges.length === 0) return true
  return isIndicatorVisibleOnPeriod(period, ranges)
}

/**
 * 用可见范围包一层 paint；未声明范围时直接复用原 Layer，避免每帧多一次判断。
 * @param layer 原始渲染器 Layer
 * @param definition 指标定义
 * @returns 受可见范围约束的 Layer
 */
function withPeriodVisibility(
  layer: Layer<RenderContext>,
  definition: IndicatorMetadata,
): Layer<RenderContext> {
  const ranges = definition.visiblePeriods
  if (ranges === undefined || ranges.length === 0) return layer
  return {
    ...layer,
    paint: (context) => {
      if (!isLayerVisibleOnPeriod(definition, context.period)) return
      layer.paint(context)
    },
  }
}

/**
 * 由指标定义创建 Layer。
 * 主图与副图共用定义工厂，名称由目录统一解析。
 */
export function createIndicatorLayer(options: IndicatorLayerOptions): Layer<RenderContext> {
  const { definition, role } = options
  const created = definition.rendererFactory({
    paneId: options.paneId,
    indicatorId: options.indicatorId,
    instanceId: options.instanceId,
    params: options.params,
  })
  const layer = withPeriodVisibility(created, definition)
  return role && role !== layer.role ? { ...layer, role } : layer
}
