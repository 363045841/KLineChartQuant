/** 将已注册的指标 metadata 映射为新执行器使用的计算定义。 */
import type { IndicatorMetadata } from '../../indicatorMetadata.js'
import type { IndicatorCalculationDefinition } from '../execution/instanceCalculationRuntime.js'

/**
 * 创建 inline 计算定义。
 * 没有 runtime 的定义不是可计算指标，因此不会进入执行器。
 */
export function createInstanceCalculationDefinitions(
  metadata: Iterable<IndicatorMetadata>,
): readonly IndicatorCalculationDefinition[] {
  const definitions: IndicatorCalculationDefinition[] = []
  for (const item of metadata) {
    const runtime = item.runtime
    if (!runtime) continue
    const definition: IndicatorCalculationDefinition = {
      definitionId: item.name,
      outputAlignment: runtime.outputAlignment,
      compute: runtime.compute,
      createCompute: runtime.createCompute,
    }
    definitions.push(Object.freeze(definition))
  }
  return Object.freeze(definitions)
}
