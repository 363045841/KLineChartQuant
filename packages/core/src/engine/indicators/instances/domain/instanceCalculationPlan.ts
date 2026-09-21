/**
 * 实例快照到计算执行计划的纯转换。
 *
 * 计划以 calculationKey 去重；pane、样式和 instanceId 不进入 calculator。
 * Worker 与 inline runtime 只消费这里的任务结构。
 */
import {
  createIndicatorCalculationKey,
  type IndicatorCalculationKey,
  type IndicatorInstance,
  type IndicatorInstanceId,
  type IndicatorInstanceSnapshot,
  type IndicatorParameters,
  type IndicatorSeriesResult,
} from './instanceModel.js'

/** 一次 calculator 调用所需的完整输入。 */
export interface IndicatorCalculationTask {
  readonly calculationKey: IndicatorCalculationKey
  readonly definitionId: string
  readonly params: IndicatorParameters
  readonly context: IndicatorParameters
  /** 共享本次计算产物的启用实例。仅用于结果分发，不传给 calculator。 */
  readonly instanceIds: readonly IndicatorInstanceId[]
}

/** 某个实例快照对应的、可跨 Worker 传输的计算计划。 */
export interface IndicatorCalculationPlan {
  readonly calculationRevision: number
  readonly tasks: readonly IndicatorCalculationTask[]
}

/**
 * 计算计划供给源。
 * 由接入层实现，执行层只依赖该契约，避免执行层反向依赖装配层。
 */
export interface IndicatorCalculationSource {
  snapshot(): IndicatorInstanceSnapshot
  calculationPlan(): IndicatorCalculationPlan
}

/** calculator 或 Worker 对一个去重任务的原始输出。 */
export interface IndicatorCalculationOutput {
  readonly calculationKey: IndicatorCalculationKey
  readonly series: unknown
  readonly firstReadyIndex: number | null
}

/**
 * 从当前实例快照构造计算计划。
 *
 * 相同 definitionId、params 和 context 的实例只产生一个任务；即使它们位于不同 pane，
 * 也在 `instanceIds` 中共享该任务结果。
 */
export function createIndicatorCalculationPlan(
  snapshot: IndicatorInstanceSnapshot,
): IndicatorCalculationPlan {
  const tasks = new Map<IndicatorCalculationKey, IndicatorCalculationTask>()
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
        params: instance.calculation.params,
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

/**
 * 将去重任务输出分发为按实例 ID 存储的结果。
 *
 * 返回值保持实例结果池的唯一事实模型；同一 task 的多个实例可以安全共享同一 series 引用。
 */
export function expandIndicatorCalculationOutputs(
  plan: IndicatorCalculationPlan,
  outputs: Iterable<IndicatorCalculationOutput>,
  dataRevision: number,
): ReadonlyMap<IndicatorInstanceId, IndicatorSeriesResult> {
  const outputByKey = new Map<IndicatorCalculationKey, IndicatorCalculationOutput>()
  for (const output of outputs) {
    if (outputByKey.has(output.calculationKey)) {
      throw new TypeError(`Duplicate indicator calculation output: ${output.calculationKey}`)
    }
    outputByKey.set(output.calculationKey, output)
  }

  const results = new Map<IndicatorInstanceId, IndicatorSeriesResult>()
  for (const task of plan.tasks) {
    const output = outputByKey.get(task.calculationKey)
    if (!output) throw new TypeError(`Missing indicator calculation output: ${task.calculationKey}`)
    for (const instanceId of task.instanceIds) {
      results.set(
        instanceId,
        Object.freeze({
          instanceId,
          calculationKey: task.calculationKey,
          dataRevision,
          params: task.params,
          series: output.series,
          firstReadyIndex: output.firstReadyIndex,
        }),
      )
    }
  }
  if (outputByKey.size !== plan.tasks.length) {
    throw new TypeError('Indicator calculation output does not match execution plan')
  }
  return results
}

/** 将计划中的实例按 pane 分组；仅供投影层读取，绝不参与计算分组。 */
export function groupInstancesByPane(
  instances: Iterable<IndicatorInstance>,
): ReadonlyMap<string, readonly IndicatorInstance[]> {
  const panes = new Map<string, IndicatorInstance[]>()
  for (const instance of instances) {
    const pane = panes.get(instance.paneId) ?? []
    pane.push(instance)
    panes.set(instance.paneId, pane)
  }
  return new Map([...panes].map(([paneId, entries]) => [paneId, Object.freeze(entries)]))
}
