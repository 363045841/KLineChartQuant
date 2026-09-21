/**
 * 新指标实例链路的接线入口。
 *
 * 连接实例 CRUD 快照与去重计算计划，不依赖也不回写旧 scheduler。
 * 执行层通过 domain 的 IndicatorCalculationSource 契约消费它。
 */
import {
  type CreateIndicatorInstanceApiOptions,
  createIndicatorInstanceApi,
  type IndicatorInstanceApi,
} from '../api/indicatorInstanceApi.js'
import {
  createIndicatorCalculationPlan,
  type IndicatorCalculationPlan,
} from '../domain/instanceCalculationPlan.js'
import type { IndicatorInstanceSnapshot } from '../domain/instanceModel.js'

export interface CreateIndicatorInstancePipelineOptions
  extends Omit<CreateIndicatorInstanceApiOptions, 'onChanged'> {
  /** 实例集合变更后通知宿主；可用于触发下一次调度。 */
  readonly onInstancesChanged?: (snapshot: IndicatorInstanceSnapshot) => void
  /** 计算计划变更后通知执行器；仅计算版本变化时调用。 */
  readonly onCalculationPlanChanged?: (plan: IndicatorCalculationPlan) => void
}

export interface IndicatorInstancePipeline {
  readonly instances: IndicatorInstanceApi
  snapshot(): IndicatorInstanceSnapshot
  calculationPlan(): IndicatorCalculationPlan
}

/** 创建实例 CRUD 与去重计算计划之间的最小接线层。 */
export function createIndicatorInstancePipeline(
  options: CreateIndicatorInstancePipelineOptions,
): IndicatorInstancePipeline {
  let plan: IndicatorCalculationPlan | null = null
  let calculationRevision = -1
  const onChanged = (snapshot: IndicatorInstanceSnapshot): void => {
    options.onInstancesChanged?.(snapshot)
    if (snapshot.calculationRevision === calculationRevision) return
    calculationRevision = snapshot.calculationRevision
    plan = createIndicatorCalculationPlan(snapshot)
    options.onCalculationPlanChanged?.(plan)
  }
  const instances = createIndicatorInstanceApi({
    initial: options.initial,
    createId: options.createId,
    onChanged,
  })
  plan = createIndicatorCalculationPlan(instances.snapshot())
  calculationRevision = instances.snapshot().calculationRevision

  return Object.freeze({
    instances,
    snapshot: () => instances.snapshot(),
    calculationPlan: () => plan!,
  })
}
