/**
 * instances/ 计算链路测试共享夹具：实例快照、计算计划、可控执行器与输出构造。
 * 仅供 __tests__ 消费；vitest 只收集 *.test.ts，本文件不会被当作测试。
 */

import type { KLineData } from '@/types/price'
import {
  createIndicatorCalculationPlan,
  type IndicatorCalculationOutput,
  type IndicatorCalculationPlan,
  type IndicatorCalculationSource,
} from '../../instances/domain/instanceCalculationPlan'
import {
  createIndicatorInstanceSnapshot,
  type IndicatorInstance,
  type IndicatorInstanceSnapshot,
  type IndicatorParameterValue,
} from '../../instances/domain/instanceModel'

/** 计算参数值集合别名，便于用例声明。 */
export type TestParams = Readonly<Record<string, IndicatorParameterValue>>

/** 构造递增的测试行情，价格与成交量均可预测。 */
export function createTestData(length: number): KLineData[] {
  return Array.from({ length }, (_, index) => ({
    timestamp: 1_000_000_000_000 + index * 60_000,
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100 + index,
    volume: 1000 + index * 100,
  }))
}

/** 构造单个计算实例；definitionId 同时写入 calculation 身份。 */
export function createTestInstance(input: {
  instanceId: string
  definitionId: string
  paneId?: string
  params?: TestParams
  context?: TestParams
}): IndicatorInstance {
  return {
    instanceId: input.instanceId,
    definitionId: input.definitionId,
    paneId: input.paneId ?? 'main',
    calculation: {
      definitionId: input.definitionId,
      params: input.params ?? {},
      context: input.context ?? {},
    },
    presentation: {},
  }
}

/** 构造测试实例快照；revision 可显式覆盖以模拟计算版本变化。 */
export function createTestSnapshot(
  instances: IndicatorInstance[],
  revisions?: { calculationRevision: number; presentationRevision: number },
): IndicatorInstanceSnapshot {
  return createIndicatorInstanceSnapshot(instances, revisions)
}

/** 快照可替换的计算计划供给源，用于模拟执行期间的版本变化。 */
export class FakeCalculationSource implements IndicatorCalculationSource {
  private current: IndicatorInstanceSnapshot

  constructor(instances: IndicatorInstance[]) {
    this.current = createIndicatorInstanceSnapshot(instances)
  }

  snapshot(): IndicatorInstanceSnapshot {
    return this.current
  }

  calculationPlan(): IndicatorCalculationPlan {
    return createIndicatorCalculationPlan(this.current)
  }

  /** 替换当前快照，模拟实例集合或计算版本在执行期间发生变化。 */
  replace(snapshot: IndicatorInstanceSnapshot): void {
    this.current = snapshot
  }
}

/** 由计划生成匹配数量的执行输出，series 与 firstReadyIndex 由用例指定。 */
export function createOutputs(
  plan: IndicatorCalculationPlan,
  series: unknown,
  firstReadyIndex: number | null = null,
): readonly IndicatorCalculationOutput[] {
  return plan.tasks.map((task) => ({
    calculationKey: task.calculationKey,
    series,
    firstReadyIndex,
  }))
}
