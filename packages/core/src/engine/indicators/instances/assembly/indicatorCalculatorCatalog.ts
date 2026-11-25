/**
 * 指标元数据到计算定义的唯一映射。
 *
 * 会话级定义仓库与图表装配共用这一份换算；不存在第二条执行链。
 */
import type { CalculationDefinition } from '../../../calculation/index.js'
import { STATEFUL } from '@363045841yyt/klinechart-plot-contracts'
import type { IndicatorMetadata } from '../../indicatorMetadata.js'

/**
 * 装配一个可计算定义。
 *
 * 没有 runtime 的定义不参与计算（纯渲染型指标），返回 undefined。
 *
 * @param item 已注册的指标或警报元数据
 * @returns 计算定义；无计算端口时为 undefined
 */
export function toCalculationDefinition(
  item: IndicatorMetadata,
): CalculationDefinition | undefined {
  const runtime = item.runtime
  if (!runtime) return undefined
  return Object.freeze({
    definitionId: item.name,
    dependency: runtime.dependency ?? STATEFUL,
    compute: runtime.compute,
    ...(runtime.createCompute ? { createCompute: runtime.createCompute } : {}),
  })
}
