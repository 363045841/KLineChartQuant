/**
 * 将已注册的指标 metadata 映射为计算层的可计算定义。
 *
 * 视图与计算在此解耦：这里只声明依赖、输入与输出，不创建图层、不读视口。
 */
import type { CalculationCompute, CalculationDefinition } from '../../../calculation/index.js'
import type { IndicatorMetadata } from '../../indicatorMetadata.js'

/** 指标 metadata 的计算端口包装为计算输出；指标当前不产生事件。 */
function computeFrom(
  runtime: (data: Parameters<CalculationCompute>[0], inputs: Parameters<CalculationCompute>[1], market: Parameters<CalculationCompute>[2], range: Parameters<CalculationCompute>[3]) => unknown,
): CalculationCompute {
  return async (data, inputs, market, range) => ({
    series: await runtime(data, inputs, market, range),
  })
}

/**
 * 创建 inline 计算定义。
 * 没有 runtime 的定义不是可计算指标，因此不会进入计算层。
 */
export function createIndicatorCalculators(
  metadata: Iterable<IndicatorMetadata>,
): readonly CalculationDefinition[] {
  const definitions: CalculationDefinition[] = []
  for (const item of metadata) {
    const runtime = item.runtime
    if (!runtime) continue
    const definition: CalculationDefinition = {
      definitionId: item.name,
      dependency: runtime.dependency ?? Object.freeze({ kind: 'stateful' } as const),
      compute: computeFrom(runtime.compute),
      ...(runtime.createCompute
        ? {
            createCompute: () => {
              const compute = runtime.createCompute!()
              return Object.assign(computeFrom(compute), {
                dispose: () => compute.dispose?.(),
              })
            },
          }
        : {}),
    }
    definitions.push(Object.freeze(definition))
  }
  return Object.freeze(definitions)
}
