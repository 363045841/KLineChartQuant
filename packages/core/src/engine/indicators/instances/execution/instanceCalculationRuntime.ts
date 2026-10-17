/**
 * 实例计算计划的共享执行核心。
 *
 * Worker 入口与 inline fallback 都只能通过此模块执行任务，从而保证二者的去重、
 * 参数和 firstReadyIndex 语义完全一致。
 */

import { isOhlcPlot } from '@363045841yyt/klinechart-plot-contracts'
import type { KLineData } from '@/foundation/types/price.js'
import type { TradeSnapshot } from '../../../../data/trades/types.js'
import { isPlotCollection } from '../../../plots/impl/readPlotState.js'
import type {
  IndicatorCalculationOutput,
  IndicatorCalculationPlan,
  IndicatorCalculationTask,
} from '../domain/instanceCalculationPlan.js'
import type { IndicatorParameters } from '../domain/instanceModel.js'

export interface IndicatorCalculationDefinition {
  readonly inputs?: readonly 'trades'[]
  readonly createCompute?: () => IndicatorCalculationDefinition['compute']
  readonly definitionId: string
  readonly outputAlignment?: 'bar' | 'aggregate'
  compute(
    data: KLineData[],
    params: IndicatorParameters,
    trades?: TradeSnapshot,
    market?: import('@363045841yyt/klinechart-plot-contracts').IndicatorMarketContext,
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

/** 执行一个去重任务。context 的解释权属于未来具备上下文计算能力的 definition；当前不隐式混入参数。 */
export async function executeIndicatorCalculationTask(
  task: IndicatorCalculationTask,
  data: KLineData[],
  resolveDefinition: IndicatorCalculationDefinitionResolver,
  trades?: TradeSnapshot,
  market?: import('@363045841yyt/klinechart-plot-contracts').IndicatorMarketContext,
): Promise<IndicatorCalculationOutput> {
  const definition = resolveDefinition(task.definitionId)
  if (!definition) throw new TypeError(`Unknown indicator definition: ${task.definitionId}`)
  let series: unknown
  try {
    series = await definition.compute(data, task.params, trades, market)
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
        : findInstanceFirstReadyIndex(series, data.length),
  })
}

/** 按计划顺序执行所有任务；每个 calculationKey 恰好执行一次。 */
export async function executeIndicatorCalculationPlan(
  plan: IndicatorCalculationPlan,
  data: KLineData[],
  resolveDefinition: IndicatorCalculationDefinitionResolver,
  trades?: TradeSnapshot,
): Promise<readonly IndicatorCalculationOutput[]> {
  return Object.freeze(
    await Promise.all(
      plan.tasks.map((task) =>
        executeIndicatorCalculationTask(task, data, resolveDefinition, trades),
      ),
    ),
  )
}
