/** 将已注册的指标 metadata 映射为新执行器使用的计算定义。 */
import type { IndicatorMetadata } from '../../indicatorMetadata.js'
import type { IndicatorCalculationDefinition } from '../execution/instanceCalculationRuntime.js'
import type { SerializedIndicatorCalculationDefinition } from '../worker/instanceWorkerProtocol.js'

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
      compute: (data, params) => runtime.compute(data, params),
    }
    definitions.push(Object.freeze(definition))
  }
  return Object.freeze(definitions)
}

/** 创建 Worker 初始化所需的纯描述；不暴露 pane、样式或旧 configKey。 */
export function serializeInstanceCalculationDefinitions(
  metadata: Iterable<IndicatorMetadata>,
): readonly SerializedIndicatorCalculationDefinition[] {
  const definitions: SerializedIndicatorCalculationDefinition[] = []
  for (const item of metadata) {
    const runtime = item.runtime
    if (!runtime) continue
    definitions.push(
      Object.freeze({
        definitionId: item.name,
        computeKey: runtime.computeKey,
        outputAlignment: runtime.outputAlignment,
      }),
    )
  }
  return Object.freeze(definitions)
}
