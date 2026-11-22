/**
 * 实例快照到计算执行计划的纯转换。
 *
 * 计划以 calculationKey 去重；pane、样式和 instanceId 不进入计算器。
 * 执行器与 Worker 只消费这里的任务结构。
 */
import {
  type CalculationKey,
  createIndicatorCalculationKey,
  type IndicatorError,
  type IndicatorInputs,
  type IndicatorInstance,
  type IndicatorInstanceId,
  type IndicatorInstanceSnapshot,
  type IndicatorResult,
} from './indicatorModel.js'

/** 一次计算调用所需的完整输入。 */
export interface CalculationTask {
  readonly calculationKey: CalculationKey
  readonly definitionId: string
  readonly inputs: IndicatorInputs
  readonly context: IndicatorInputs
  /** 共享本次计算产物的启用实例；仅用于结果分发，不传给计算器。 */
  readonly instanceIds: readonly IndicatorInstanceId[]
}

/** 某个实例快照对应的、可跨 Worker 传输的计算计划。 */
export interface CalculationPlan {
  readonly calculationRevision: number
  readonly tasks: readonly CalculationTask[]
}

/** 计算计划供给源；执行层只依赖该契约，不反向依赖装配层。 */
export interface CalculationPlanSource {
  calculationPlan(): CalculationPlan
}

/** 计算器对一个去重任务的原始输出。 */
export interface IndicatorSeriesOutput {
  readonly calculationKey: CalculationKey
  readonly series: unknown
  readonly error?: IndicatorError
}

/** 计算结果的修订身份；读取方据此判断结果是否仍然有效。 */
export interface ResultRevision {
  readonly dataRevision: number
  readonly marketRevision: number
}

/**
 * 从当前实例快照构造计算计划。
 *
 * 相同 definitionId、inputs 和 context 的实例只产生一个任务；即使它们位于不同 pane，
 * 也在 `instanceIds` 中共享该任务结果。
 */
export function createIndicatorCalculationPlan(
  snapshot: IndicatorInstanceSnapshot,
): CalculationPlan {
  const tasks = new Map<CalculationKey, CalculationTask>()
  for (const instance of snapshot.instances.values()) {
    const calculationKey = createIndicatorCalculationKey(instance.calculation)
    const previous = tasks.get(calculationKey)
    if (previous) {
      tasks.set(calculationKey, {
        ...previous,
        instanceIds: Object.freeze([...previous.instanceIds, instance.instanceId]),
      })
      continue
    }
    tasks.set(
      calculationKey,
      Object.freeze({
        calculationKey,
        definitionId: instance.definitionId,
        inputs: instance.calculation.inputs,
        context: instance.calculation.context,
        instanceIds: Object.freeze([instance.instanceId]),
      }),
    )
  }
  return Object.freeze({
    calculationRevision: snapshot.calculationRevision,
    tasks: Object.freeze([...tasks.values()]),
  })
}

/** 单任务结果投影；实例身份由结果池的键承担，不重复写入结果。 */
export function toIndicatorResult(
  output: IndicatorSeriesOutput,
  revision: ResultRevision,
  timestamps: readonly number[],
): IndicatorResult {
  return Object.freeze({
    timestamps,
    dataRevision: revision.dataRevision,
    marketRevision: revision.marketRevision,
    series: output.series,
    ...(output.error ? { error: output.error } : {}),
  })
}

/** 判断结果是否由给定版本计算得到。 */
export function isResultRevision(result: IndicatorResult, revision: ResultRevision): boolean {
  return (
    result.dataRevision === revision.dataRevision &&
    result.marketRevision === revision.marketRevision
  )
}
