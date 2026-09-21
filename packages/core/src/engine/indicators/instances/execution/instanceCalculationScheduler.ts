/**
 * 新实例链路的计算调度器。
 *
 * 它接收 pipeline 的当前计划，使用注入的执行器运行任务，再展开为按实例 ID 保存的结果池。
 * Worker adapter 与 inline adapter 实现相同的 execute 契约，调度器不感知二者差异。
 */

import type { KLineData } from '../../../../foundation/types/price.js'
import {
  expandIndicatorCalculationOutputs,
  type IndicatorCalculationOutput,
  type IndicatorCalculationPlan,
  type IndicatorCalculationSource,
} from '../domain/instanceCalculationPlan.js'
import type { IndicatorResultPool } from '../domain/instanceModel.js'

export interface IndicatorCalculationExecutor {
  setData(data: KLineData[], dataRevision: number): Promise<void>
  execute(
    plan: IndicatorCalculationPlan,
    dataRevision: number,
  ): Promise<readonly IndicatorCalculationOutput[]>
}

export interface InstanceCalculationCommit {
  readonly requestId: number
  readonly pool: IndicatorResultPool
}

export interface CreateInstanceCalculationSchedulerOptions {
  readonly pipeline: IndicatorCalculationSource
  readonly executor: IndicatorCalculationExecutor
  readonly onCommit: (commit: InstanceCalculationCommit) => void
  readonly onError?: (error: unknown) => void
}

/** 仅接受最新请求结果的实例调度器。 */
export function createInstanceCalculationScheduler(
  options: CreateInstanceCalculationSchedulerOptions,
) {
  let requestId = 0
  let committedRequestId = 0

  return Object.freeze({
    async compute(input: {
      readonly dataRevision: number
      readonly timestamps: readonly number[]
      readonly data: KLineData[]
    }): Promise<boolean> {
      const nextRequestId = ++requestId
      const snapshot = options.pipeline.snapshot()
      const plan = options.pipeline.calculationPlan()
      try {
        await options.executor.setData(input.data, input.dataRevision)
        const outputs = await options.executor.execute(plan, input.dataRevision)
        // 结果必须仍然对应发起时的实例版本，且不能覆盖之后的成功请求。
        if (nextRequestId < requestId || nextRequestId <= committedRequestId) return false
        if (options.pipeline.snapshot().calculationRevision !== snapshot.calculationRevision)
          return false
        const results = expandIndicatorCalculationOutputs(plan, outputs, input.dataRevision)
        const pool: IndicatorResultPool = Object.freeze({
          dataRevision: input.dataRevision,
          instanceRevision: snapshot.calculationRevision,
          timestamps: Object.freeze([...input.timestamps]),
          results,
        })
        committedRequestId = nextRequestId
        options.onCommit({ requestId: nextRequestId, pool })
        return true
      } catch (error) {
        if (nextRequestId === requestId) options.onError?.(error)
        return false
      }
    },
  })
}
