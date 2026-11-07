/** 已发布结果的唯一仓库；每个计算身份独立提交，结果自带原始时间轴。 */
import {
  expandIndicatorCalculationOutputs,
  type IndicatorCalculationOutput,
  type IndicatorCalculationPlan,
} from '../domain/instanceCalculationPlan.js'
import type { IndicatorResultPool } from '../domain/instanceModel.js'
import type { IndicatorCalculationInput } from './types.js'

export class InstanceResultStore {
  private readonly completed = new Map<
    string,
    { output: IndicatorCalculationOutput; input: IndicatorCalculationInput }
  >()

  /** 单任务串行完成，结果只向前推进；删除/切换时由retain/clear撤销旧身份。 */
  publish(output: IndicatorCalculationOutput, input: IndicatorCalculationInput): void {
    const previous = this.completed.get(output.calculationKey)
    if (!previous || input.dataRevision >= previous.input.dataRevision)
      this.completed.set(output.calculationKey, { output, input })
  }

  retain(plan: IndicatorCalculationPlan): void {
    const active = new Set(plan.tasks.map((task) => task.calculationKey))
    for (const key of this.completed.keys()) if (!active.has(key)) this.completed.delete(key)
  }

  clear(): void {
    this.completed.clear()
  }

  /** 按当前实例关系展开；等待中的其它任务继续保留自己的已发布快照。 */
  snapshot(plan: IndicatorCalculationPlan, input: IndicatorCalculationInput): IndicatorResultPool {
    const results = new Map<string, import('../domain/instanceModel.js').IndicatorSeriesResult>()
    for (const task of plan.tasks) {
      const completed = this.completed.get(task.calculationKey)
      if (!completed) continue
      const expanded = expandIndicatorCalculationOutputs(
        { ...plan, tasks: [task] },
        [completed.output],
        completed.input.dataRevision,
      )
      for (const [id, result] of expanded)
        results.set(id, Object.freeze({ ...result, timestamps: completed.input.timestamps }))
    }
    return Object.freeze({
      dataRevision: input.dataRevision,
      instanceRevision: plan.calculationRevision,
      timestamps: input.timestamps,
      results,
    })
  }
}
