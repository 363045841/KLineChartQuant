/** 单次计算的输出规范化：错误诊断、参数传递和firstReadyIndex；不承担调度。 */

import {
  type ComputeChange,
  type ComputeDependency,
  type ComputeRange,
  isOhlcPlot,
  resolveComputeRange,
} from '@363045841yyt/klinechart-plot-contracts'
import type { KLineData } from '@/foundation/types/price.js'
import { isPlotCollection } from '../../../plots/impl/readPlotState.js'
import type {
  IndicatorCalculationOutput,
  IndicatorCalculationTask,
} from '../domain/instanceCalculationPlan.js'
import type { IndicatorParameters } from '../domain/instanceModel.js'
import type { IndicatorCalculationInput } from './types.js'

export interface IndicatorCalculationDefinition {
  readonly createCompute?: () => IndicatorCalculationDefinition['compute'] & { dispose?(): void }
  readonly definitionId: string
  readonly outputAlignment?: 'bar' | 'aggregate'
  /** 计算对历史的依赖；由定义声明，缺省按有状态处理。 */
  readonly dependency: ComputeDependency
  compute(
    data: readonly KLineData[],
    params: IndicatorParameters,
    market?: import('@363045841yyt/klinechart-plot-contracts').IndicatorMarketContext,
    range?: ComputeRange,
  ): unknown
}

export type IndicatorCalculationDefinitionResolver = (
  definitionId: string,
) => IndicatorCalculationDefinition | undefined

/** 查找按 K 线下标对齐的嵌套序列中第一个有效值。 */
export function findInstanceFirstReadyIndex(value: unknown, dataLength: number): number | null {
  if (isPlotCollection(value)) {
    let first: number | null = null
    for (const plot of value.plots) {
      const index = isOhlcPlot(plot)
        ? plot.data.findIndex((point) => point !== undefined)
        : plot.data.findIndex((point) => point !== undefined && Number.isFinite(point.value))
      if (index >= 0 && (first === null || index < first)) first = index
    }
    return first
  }
  if (Array.isArray(value)) {
    if (value.length !== dataLength) return null
    for (let index = 0; index < value.length; index++) {
      if (value[index] !== undefined && value[index] !== null) return index
    }
    return null
  }
  if (value !== null && typeof value === 'object') {
    let first: number | null = null
    for (const nested of Object.values(value as Record<string, unknown>)) {
      const index = findInstanceFirstReadyIndex(nested, dataLength)
      if (index !== null && (first === null || index < first)) first = index
    }
    return first
  }
  return null
}

/** 执行一个去重任务。重算区间由依赖推导，执行器只消费。 */
export async function executeIndicatorCalculationTask(
  task: IndicatorCalculationTask,
  input: IndicatorCalculationInput,
  resolveDefinition: IndicatorCalculationDefinitionResolver,
  market?: import('@363045841yyt/klinechart-plot-contracts').IndicatorMarketContext,
): Promise<IndicatorCalculationOutput> {
  const definition = resolveDefinition(task.definitionId)
  if (!definition) throw new TypeError(`Unknown indicator definition: ${task.definitionId}`)
  const range = resolveComputeRange(input.change, definition.dependency, input.data.length)
  let series: unknown
  try {
    series = await definition.compute(input.data, task.params, market, range)
  } catch (error) {
    // 失败作为本任务的结果提交，其他实例继续计算，旧绘图随结果池一并替换。
    return Object.freeze({
      calculationKey: task.calculationKey,
      series: undefined,
      firstReadyIndex: null,
      error: Object.freeze({
        message: error instanceof Error ? error.message : String(error),
        ...(error instanceof Error && 'code' in error && typeof error.code === 'string'
          ? { code: error.code }
          : {}),
        ...(error instanceof Error && 'plotId' in error && typeof error.plotId === 'string'
          ? { plotId: error.plotId }
          : {}),
        ...(error instanceof Error && 'barIndex' in error && typeof error.barIndex === 'number'
          ? { barIndex: error.barIndex }
          : {}),
      }),
    })
  }
  return Object.freeze({
    calculationKey: task.calculationKey,
    series,
    firstReadyIndex:
      definition.outputAlignment === 'aggregate'
        ? null
        : findInstanceFirstReadyIndex(series, input.data.length),
  })
}
