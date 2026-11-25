/**
 * 把已注册的指标 metadata 映射为可计算定义。
 *
 * 图表、警报与 Agent 都从这里取得同一份计算入口；不存在第二条执行链。
 */
import type { CalculationDefinition } from '../../../calculation/index.js'
import { STATEFUL } from '@363045841yyt/klinechart-plot-contracts'
import type { IndicatorMetadata } from '../../indicatorMetadata.js'

/**
 * 装配可计算定义。
 *
 * 没有 runtime 的定义不参与计算（纯渲染型指标）。
 */
export function createIndicatorCalculators(
  metadata: Iterable<IndicatorMetadata>,
): readonly CalculationDefinition[] {
  const definitions: CalculationDefinition[] = []
  for (const item of metadata) {
    const runtime = item.runtime
    if (!runtime) continue
    definitions.push(
      Object.freeze({
        definitionId: item.name,
        dependency: runtime.dependency ?? STATEFUL,
        compute: runtime.compute,
        ...(runtime.createCompute ? { createCompute: runtime.createCompute } : {}),
      }),
    )
  }
  return Object.freeze(definitions)
}
