/** 单次计算的输入规范化：错误诊断与 inputs 传递；不承担调度。 */
import {
  type ComputeChange,
  type ComputeDependency,
  type ComputeRange,
  resolveComputeRange,
} from '@363045841yyt/klinechart-plot-contracts'
import type { KLineData } from '@/foundation/types/price.js'
import type { CalculationTask, IndicatorSeriesOutput } from '../domain/calculationPlan.js'
import type { IndicatorInputs } from '../domain/indicatorModel.js'
import type { MarketSnapshot } from './types.js'

/** 计算器：已注册定义中参与计算的最小声明。 */
export interface IndicatorCalculator {
  readonly createCompute?: () => IndicatorCalculator['compute'] & { dispose?(): void }
  readonly definitionId: string
  /** 计算对历史的依赖；由定义声明，缺省按有状态处理。 */
  readonly dependency: ComputeDependency
  compute(
    data: readonly KLineData[],
    inputs: IndicatorInputs,
    market?: import('@363045841yyt/klinechart-plot-contracts').IndicatorMarketContext,
    range?: ComputeRange,
  ): unknown
}

export type IndicatorCalculatorResolver = (definitionId: string) => IndicatorCalculator | undefined

/** 执行一个去重任务；重算区间由依赖推导，执行器只消费。 */
export async function executeIndicatorCalculationTask(
  task: CalculationTask,
  snapshot: MarketSnapshot,
  resolveCalculator: IndicatorCalculatorResolver,
  market?: import('@363045841yyt/klinechart-plot-contracts').IndicatorMarketContext,
): Promise<IndicatorSeriesOutput> {
  const calculator = resolveCalculator(task.definitionId)
  if (!calculator) throw new TypeError(`Unknown indicator definition: ${task.definitionId}`)
  const range = resolveComputeRange(
    snapshot.change as ComputeChange,
    calculator.dependency,
    snapshot.data.length,
  )
  let series: unknown
  try {
    series = await calculator.compute(snapshot.data, task.inputs, market, range)
  } catch (error) {
    // 失败作为本任务的结果提交，其他实例继续计算，旧输出随结果池一并替换。
    return Object.freeze({
      calculationKey: task.calculationKey,
      series: undefined,
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
  return Object.freeze({ calculationKey: task.calculationKey, series })
}
