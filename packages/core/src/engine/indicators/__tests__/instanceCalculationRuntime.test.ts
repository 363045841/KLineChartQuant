/**
 * 实例计算执行核心测试：计算键去重、参数隔离、warm-up 边界与执行运行时契约。
 */
import { describe, expect, it, vi } from 'vitest'

import type { KLineData } from '@/types/price'
import { EMPTY_TRADE_SNAPSHOT, type TradeBatch } from '../../../data/trades/types'

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
import {
  diffTradeSnapshot,
  IndicatorInstanceExecutionRuntime,
} from '../instances/execution/instanceExecutionRuntime'
import {
  createTestData,
  createTestInstance,
  FakeCalculationSource,
} from './helpers/instanceTestKit'

/** 构造仅用于引用前缀比较的成交批次。 */
function createTradeBatch(tradeId: string): TradeBatch {
  return {
    items: [{ tradeId, timestamp: 0, price: '1', size: '1', side: 'buy' }],
    range: { from: 0, to: 1 },
    complete: true,
  }
}

describe('成交输入依赖', () => {
  // 只改变成交版本时，纯 K 线计算结果复用；成交依赖必须重新计算。
  it('invalidates only calculators that declare trades', () => {
    const source = new FakeCalculationSource([
      createTestInstance({ instanceId: 'bars', definitionId: 'bars' }),
      createTestInstance({ instanceId: 'trades', definitionId: 'trades' }),
    ])
    const bars = vi.fn(() => [1])
    const trades = vi.fn(() => [2])
    const runtime = new IndicatorInstanceExecutionRuntime([
      { definitionId: 'bars', compute: bars },
      { definitionId: 'trades', inputs: ['trades'], compute: trades },
    ])
    const data = createTestData(2)
    runtime.setData(data, 1, {
      mode: 'replace',
      snapshot: { ...EMPTY_TRADE_SNAPSHOT, revision: 1 },
    })
    runtime.execute(source.calculationPlan())
    runtime.setData(data, 1, {
      mode: 'replace',
      snapshot: { ...EMPTY_TRADE_SNAPSHOT, revision: 2 },
    })
    runtime.execute(source.calculationPlan())
    expect(bars).toHaveBeenCalledTimes(1)
    expect(trades).toHaveBeenCalledTimes(2)
    runtime.setData(data, 2, {
      mode: 'replace',
      snapshot: { ...EMPTY_TRADE_SNAPSHOT, revision: 2 },
    })
    runtime.execute(source.calculationPlan())
    expect(bars).toHaveBeenCalledTimes(2)
    expect(trades).toHaveBeenCalledTimes(3)
  })
})

describe('diffTradeSnapshot', () => {
  // 引用前缀扩展时只返回新增批次，避免整段快照结构化克隆。
  it('引用前缀扩展时返回仅含新增批次的 append 增量', () => {
    const a = createTradeBatch('a')
    const b = createTradeBatch('b')
    const c = createTradeBatch('c')
    const previous = { ...EMPTY_TRADE_SNAPSHOT, revision: 1, batches: [a, b] }
    const next = { ...EMPTY_TRADE_SNAPSHOT, revision: 2, batches: [a, b, c] }

    const diff = diffTradeSnapshot(previous, next)

    expect(diff.mode).toBe('append')
    expect(diff.snapshot.batches).toEqual([c])
    expect(diff.snapshot.batches[0]).toBe(c)
  })

  // 长度不变（仅版本推进）时同样走 append，增量为空，避免重复克隆整段批次。
  it('批次引用完全一致时返回空增量', () => {
    const a = createTradeBatch('a')
    const b = createTradeBatch('b')
    const previous = { ...EMPTY_TRADE_SNAPSHOT, revision: 1, batches: [a, b] }

    const diff = diffTradeSnapshot(previous, {
      ...EMPTY_TRADE_SNAPSHOT,
      revision: 2,
      batches: [a, b],
    })

    expect(diff.mode).toBe('append')
    expect(diff.snapshot.batches).toEqual([])
    expect(diff.snapshot.revision).toBe(2)
  })

  // 前缀引用不同、长度缩短或没有上一份时，必须整段替换。
  it('无法证明引用前缀时返回 replace', () => {
    const a = createTradeBatch('a')
    const b = createTradeBatch('b')
    const previous = { ...EMPTY_TRADE_SNAPSHOT, revision: 1, batches: [a, b] }

    expect(
      diffTradeSnapshot(previous, {
        ...EMPTY_TRADE_SNAPSHOT,
        revision: 2,
        batches: [a, createTradeBatch('b'), createTradeBatch('c')],
      }).mode,
    ).toBe('replace')
    expect(
      diffTradeSnapshot(previous, { ...EMPTY_TRADE_SNAPSHOT, revision: 2, batches: [a] }).mode,
    ).toBe('replace')
    expect(
      diffTradeSnapshot(undefined, { ...EMPTY_TRADE_SNAPSHOT, revision: 1, batches: [a] }).mode,
    ).toBe('replace')
  })
})

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

  // append 在已缓存批次后追加、replace 整段覆盖，二者共用同一合并路径。
  it('按显式模式合并成交并驱动 trades 依赖重算', () => {
    const source = new FakeCalculationSource([
      createTestInstance({ instanceId: 'trades-a', definitionId: 'trades' }),
    ])
    const runtime = new IndicatorInstanceExecutionRuntime([
      {
        definitionId: 'trades',
        inputs: ['trades'],
        compute: (_data, _params, trades) => trades?.batches ?? [],
      },
    ])
    const a = createTradeBatch('a')
    const b = createTradeBatch('b')
    const data = createTestData(1)

    runtime.setData(data, 1, {
      mode: 'replace',
      snapshot: { ...EMPTY_TRADE_SNAPSHOT, revision: 1, batches: [a] },
    })
    runtime.setData(data, 1, {
      mode: 'append',
      snapshot: { ...EMPTY_TRADE_SNAPSHOT, revision: 2, batches: [b] },
    })
    expect(runtime.execute(source.calculationPlan())[0]!.series).toEqual([a, b])

    runtime.setData(data, 1, {
      mode: 'replace',
      snapshot: { ...EMPTY_TRADE_SNAPSHOT, revision: 3, batches: [b] },
    })
    expect(runtime.execute(source.calculationPlan())[0]!.series).toEqual([b])
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
