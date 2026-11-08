/**
 * 指标渲染器 Layer 工厂。
 *
 * 指标定义的 `rendererFactory` 现已直接返回原生 `Layer`；本工厂负责两处：
 * 按显式 role 覆盖 role，以及按可见周期拦截不在当前周期内的绘制。
 * 可见周期有两级来源：定义声明的范围是能力上限，实例参数里的区间只能在其内收窄。
 */

import type { RenderContext } from '@/foundation/plugin/index.js'
import type { Layer } from '@/rendering/scene/types.js'
import type { IndicatorMetadata } from '../../indicators/indicatorMetadata.js'
import {
  type IndicatorPeriodRange,
  isIndicatorVisibleOnPeriod,
  resolveIndicatorPeriodRange,
} from '../../indicators/indicatorPeriodVisibility.js'
import type { IndicatorRendererOptions } from './index.js'

/** createIndicatorLayer 选项：指标渲染器参数 + 目标 role。 */
export interface IndicatorLayerOptions extends IndicatorRendererOptions {
  definition: IndicatorMetadata
  /** 显式 Layer role；缺省沿用渲染器按 pane 推导的结果（main → primary）。 */
  role?: Layer['role']
}

/** 解析该定义的可见周期区间；实例参数缺字段时用定义默认值补齐。 */
function periodRangeOf(
  definition: IndicatorMetadata,
  params: Record<string, unknown> | undefined,
): IndicatorPeriodRange {
  const defaults: Record<string, unknown> = definition.runtime?.defaultParams ?? {}
  return resolveIndicatorPeriodRange(defaults, params)
}

/** 该定义在该实例的当前周期是否应绘制；两级范围都不存在时恒为真。 */
export function isLayerVisibleOnPeriod(
  definition: IndicatorMetadata,
  period: string,
  params?: Record<string, unknown>,
): boolean {
  return isIndicatorVisibleOnPeriod(
    period,
    definition.visiblePeriods,
    periodRangeOf(definition, params),
  )
}

/**
 * 用可见周期约束包一层 paint；没有任何约束时直接复用原 Layer，避免每帧多一次判断。
 * @param layer 原始渲染器 Layer
 * @param definition 指标定义
 * @param params 指标实例参数，可携带可见周期区间
 * @returns 受可见周期约束的 Layer
 */
function withPeriodVisibility(
  layer: Layer<RenderContext>,
  definition: IndicatorMetadata,
  params: Record<string, unknown> | undefined,
): Layer<RenderContext> {
  const declared = definition.visiblePeriods
  const range = periodRangeOf(definition, params)
  const constrained =
    (declared !== undefined && declared.length > 0) ||
    range.from !== undefined ||
    range.to !== undefined
  if (!constrained) return layer
  return {
    ...layer,
    paint: (context) => {
      if (!isIndicatorVisibleOnPeriod(context.period, declared, range)) return
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
    stacked: options.stacked,
  })
  const layer = withPeriodVisibility(created, definition, options.params)
  return role && role !== layer.role ? { ...layer, role } : layer
}
