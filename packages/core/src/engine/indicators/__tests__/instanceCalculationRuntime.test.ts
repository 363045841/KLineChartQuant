/**
 * 实例计算执行核心测试：计算键去重、参数隔离、warm-up 边界与执行运行时契约。
 */
import { describe, expect, it, vi } from 'vitest'

import type { KLineData } from '@/types/price'

import {
  expandIndicatorCalculationOutputs,
  type IndicatorCalculationTask,
} from '../instances/domain/instanceCalculationPlan'
import type { IndicatorParameters } from '../instances/domain/instanceModel'
import {
  executeIndicatorCalculationPlan,
  executeIndicatorCalculationTask,
  findInstanceFirstReadyIndex,
} from '../instances/execution/instanceCalculationRuntime'
import { IndicatorInstanceExecutionRuntime } from '../instances/execution/instanceExecutionRuntime'
import {
  createTestData,
  createTestInstance,
  FakeCalculationSource,
} from './helpers/instanceTestKit'

describe('executeIndicatorCalculationPlan', () => {
  it('相同计算参数的不同实例只执行一次并共享结果引用', () => {
    const source = new FakeCalculationSource([
      createTestInstance({
        instanceId: 'macd-a',
        definitionId: 'macd',
        paneId: 'pane-a',
        params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
      }),
      createTestInstance({
        instanceId: 'macd-b',
        definitionId: 'macd',
        paneId: 'pane-b',
        params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
      }),
    ])
    const plan = source.calculationPlan()
    expect(plan.tasks).toHaveLength(1)
    expect(plan.tasks[0]!.instanceIds).toEqual(['macd-a', 'macd-b'])

    const compute = vi.fn<(data: KLineData[], params: IndicatorParameters) => unknown>(
      (data, _params) => data.map((_, index) => index),
    )
    const outputs = executeIndicatorCalculationPlan(plan, createTestData(4), (definitionId) =>
      definitionId === 'macd' ? { definitionId: 'macd', compute } : undefined,
    )

    expect(compute).toHaveBeenCalledTimes(1)
    const results = expandIndicatorCalculationOutputs(plan, outputs, 3)
    expect(results.size).toBe(2)
    expect(results.get('macd-a')!.series).toBe(results.get('macd-b')!.series)
  })

  it('不同计算参数生成独立任务并各自执行', () => {
    const source = new FakeCalculationSource([
      createTestInstance({
        instanceId: 'macd-a',
        definitionId: 'macd',
        params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
      }),
      createTestInstance({
        instanceId: 'macd-b',
        definitionId: 'macd',
        params: { fastPeriod: 5, slowPeriod: 35, signalPeriod: 5 },
      }),
    ])
    const plan = source.calculationPlan()
    expect(plan.tasks).toHaveLength(2)

    const compute = vi.fn<(data: KLineData[], params: IndicatorParameters) => unknown>(
      (_data, params) => ({ fastPeriod: params.fastPeriod }),
    )
    const outputs = executeIndicatorCalculationPlan(plan, createTestData(4), (definitionId) =>
      definitionId === 'macd' ? { definitionId: 'macd', compute } : undefined,
    )
    const results = expandIndicatorCalculationOutputs(plan, outputs, 1)

    expect(compute).toHaveBeenCalledTimes(2)
    expect(results.get('macd-a')!.params).toMatchObject({ fastPeriod: 12 })
    expect(results.get('macd-b')!.params).toMatchObject({ fastPeriod: 5 })
    expect(results.get('macd-a')!.series).not.toEqual(results.get('macd-b')!.series)
  })
})

describe('findInstanceFirstReadyIndex', () => {
  it('返回嵌套序列中按 K 线下标对齐的第一个有效值', () => {
    expect(findInstanceFirstReadyIndex([undefined, undefined, 3, 4], 4)).toBe(2)
    expect(
      findInstanceFirstReadyIndex(
        { series: [undefined, 1, 2], signal: [undefined, undefined, 3] },
        3,
      ),
    ).toBe(1)
  })

  it('长度不匹配或结构不可用时返回 null', () => {
    expect(findInstanceFirstReadyIndex([1, 2], 3)).toBeNull()
    expect(findInstanceFirstReadyIndex(5, 1)).toBeNull()
  })
})

describe('executeIndicatorCalculationTask', () => {
  const task: IndicatorCalculationTask = {
    calculationKey: 'bar:{}:{}',
    definitionId: 'bar',
    params: {},
    context: {},
    instanceIds: ['bar-a'],
  }

  it('按 K 线下标对齐的输出推导 warm-up 边界', () => {
    const output = executeIndicatorCalculationTask(task, createTestData(4), () => ({
      definitionId: 'bar',
      compute: (data) => data.map((_, index) => (index < 2 ? undefined : index)),
    }))

    expect(output.firstReadyIndex).toBe(2)
  })

  it('aggregate 输出不推导 warm-up 边界', () => {
    const output = executeIndicatorCalculationTask(task, createTestData(4), () => ({
      definitionId: 'bar',
      outputAlignment: 'aggregate',
      compute: (data) => data.map((_, index) => ({ bin: index })),
    }))

    expect(output.firstReadyIndex).toBeNull()
  })
})

describe('IndicatorInstanceExecutionRuntime', () => {
  it('拒绝重复注册同名计算定义', () => {
    const runtime = new IndicatorInstanceExecutionRuntime([
      { definitionId: 'ma', compute: () => [1] },
    ])

    expect(() => runtime.addDefinition({ definitionId: 'ma', compute: () => [1] })).toThrow(
      'Duplicate indicator calculation definition: ma',
    )
    const same = { definitionId: 'ma', compute: () => [1] }
    const stable = new IndicatorInstanceExecutionRuntime([same])
    expect(() => stable.addDefinition(same)).not.toThrow()
  })

  it('拒绝回退数据版本', () => {
    const runtime = new IndicatorInstanceExecutionRuntime()
    runtime.setData(createTestData(2), 4)

    expect(() => runtime.setData(createTestData(2), 3)).toThrow(
      'Indicator data revision moved backwards: 3',
    )
  })

  it('执行计划时解析已注册定义，未知定义直接抛错', () => {
    const source = new FakeCalculationSource([
      createTestInstance({ instanceId: 'ma-a', definitionId: 'ma', params: { period: 2 } }),
    ])
    const runtime = new IndicatorInstanceExecutionRuntime([
      { definitionId: 'ma', compute: (data) => data.map((item) => item.close) },
    ])
    runtime.setData(createTestData(4), 1)

    const outputs = runtime.execute(source.calculationPlan())
    expect(outputs).toHaveLength(1)
    expect(outputs[0]!.series).toEqual([100, 101, 102, 103])

    const unknown = new FakeCalculationSource([
      createTestInstance({ instanceId: 'rsi-a', definitionId: 'rsi', params: {} }),
    ])
    expect(() => runtime.execute(unknown.calculationPlan())).toThrow(
      'Unknown indicator definition: rsi',
    )
  })
})
