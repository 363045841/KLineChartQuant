/** 从图表投影一次接收完整实例集合，统一发布实例快照与计算计划。 */
import {
  type CalculationPlanSource,
  createIndicatorCalculationPlan,
} from '../domain/calculationPlan.js'
import {
  createIndicatorCalculationKey,
  createIndicatorInstanceSnapshot,
  type IndicatorInstance,
  type IndicatorInstanceSnapshot,
} from '../domain/indicatorModel.js'

export interface IndicatorInstancePipeline extends CalculationPlanSource {
  snapshot(): IndicatorInstanceSnapshot
  /** 返回计算计划是否变化。 */
  publish(instances: readonly IndicatorInstance[]): boolean
}

/** 展示配置按字段比较，pane 或样式变动只更新实例快照。 */
function samePresentation(previous: IndicatorInstance, next: IndicatorInstance): boolean {
  const keys = Object.keys(previous.presentation)
  return (
    previous.paneId === next.paneId &&
    keys.length === Object.keys(next.presentation).length &&
    keys.every((key) => Object.is(previous.presentation[key], next.presentation[key]))
  )
}

/** 整批实例共用一次计划发布，单独的展示变化只更新快照。 */
export function createIndicatorInstancePipeline(): IndicatorInstancePipeline {
  let snapshot = createIndicatorInstanceSnapshot()
  let plan = createIndicatorCalculationPlan(snapshot)
  return {
    snapshot: () => snapshot,
    calculationPlan: () => plan,
    publish(instances) {
      let calculationChanged = snapshot.instances.size !== instances.length
      let presentationChanged = calculationChanged
      for (const next of instances) {
        const previous = snapshot.instances.get(next.instanceId)
        calculationChanged ||=
          !previous ||
          createIndicatorCalculationKey(previous.calculation) !==
            createIndicatorCalculationKey(next.calculation)
        presentationChanged ||= !previous || !samePresentation(previous, next)
      }
      if (!calculationChanged && !presentationChanged) return false

      const nextSnapshot = createIndicatorInstanceSnapshot(
        instances,
        snapshot.calculationRevision + Number(calculationChanged),
      )
      if (calculationChanged) plan = createIndicatorCalculationPlan(nextSnapshot)
      snapshot = nextSnapshot
      return calculationChanged
    },
  }
}
