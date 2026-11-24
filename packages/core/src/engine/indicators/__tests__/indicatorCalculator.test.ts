/** 单任务执行契约：计算器隔离、定义替换、错误输出和重算区间。 */

import { describe, expect, it, vi } from 'vitest'
import type { KLineData } from '@/foundation/types/price.js'
import { IndicatorCalculatorRegistry } from '../instances/execution/indicatorCalculatorRegistry.js'
import type { MarketSnapshot } from '../instances/execution/types.js'
import {
  createTestData,
  createTestInstance,
  FakeCalculationSource,
} from './helpers/instanceTestKit.js'

/** 测试行情快照：整段变化，依赖按有状态处理。 */
function snapshot(data: readonly KLineData[]): MarketSnapshot {
  return {
    dataRevision: 0,
    marketRevision: 0,
    timestamps: data.map((item) => item.timestamp),
    data,
    change: { start: 0, end: data.length },
  }
}

const STATEFUL = Object.freeze({ kind: 'stateful' } as const)

describe('indicator calculator registry', () => {
  it('disposes only calculators whose identity leaves the plan and releases the remainder on shutdown', async () => {
    const source = new FakeCalculationSource([
      createTestInstance({ instanceId: 'a', definitionId: 'value', inputs: { period: 1 } }),
      createTestInstance({ instanceId: 'b', definitionId: 'value', inputs: { period: 2 } }),
    ])
    const disposals: ReturnType<typeof vi.fn>[] = []
    const registry = new IndicatorCalculatorRegistry([
      {
        definitionId: 'value',
        dependency: STATEFUL,
        compute: () => [],
        createCompute() {
          const dispose = vi.fn()
          disposals.push(dispose)
          return Object.assign(() => [], { dispose })
        },
      },
    ])
    const tasks = source.calculationPlan().tasks
    for (const task of tasks)
      await registry.execute(task, snapshot(createTestData(1)), new AbortController().signal)
    registry.retain([tasks[1]!])
    expect(disposals[0]).toHaveBeenCalledOnce()
    expect(disposals[1]).not.toHaveBeenCalled()
    registry.retain([tasks[1]!])
    registry.dispose()
    registry.dispose()
    expect(disposals[0]).toHaveBeenCalledOnce()
    expect(disposals[1]).toHaveBeenCalledOnce()
  })

  it('reuses calculators per identity and replaces only the edited definition', async () => {
    const source = new FakeCalculationSource([
      createTestInstance({ instanceId: 'a', definitionId: 'value', inputs: { period: 1 } }),
      createTestInstance({ instanceId: 'b', definitionId: 'value', inputs: { period: 2 } }),
      createTestInstance({ instanceId: 'c', definitionId: 'other' }),
    ])
    const disposeEdited = vi.fn()
    const disposeOther = vi.fn()
    const factory = vi.fn(() =>
      Object.assign((_data: unknown, inputs: Readonly<Record<string, unknown>>) => [inputs.period], {
        dispose: disposeEdited,
      }),
    )
    const other = vi.fn(() => Object.assign(() => [9], { dispose: disposeOther }))
    const registry = new IndicatorCalculatorRegistry([
      { definitionId: 'value', dependency: STATEFUL, compute: () => [], createCompute: factory },
      { definitionId: 'other', dependency: STATEFUL, compute: () => [], createCompute: other },
    ])
    const tasks = source.calculationPlan().tasks
    const data = snapshot(createTestData(1))
    const signal = new AbortController().signal
    registry.retain(tasks)
    expect((await registry.execute(tasks[0]!, data, signal)).series).toEqual([1])
    expect((await registry.execute(tasks[1]!, data, signal)).series).toEqual([2])
    await registry.execute(tasks[0]!, data, signal)
    expect(factory).toHaveBeenCalledTimes(2)
    expect((await registry.execute(tasks[2]!, data, signal)).series).toEqual([9])

    registry.removeDefinitions(['value'])
    registry.addDefinition({ definitionId: 'value', dependency: STATEFUL, compute: () => [3] })

    expect(disposeEdited).toHaveBeenCalledTimes(2)
    expect(disposeOther).not.toHaveBeenCalled()
    expect((await registry.execute(tasks[0]!, data, signal)).series).toEqual([3])
    expect((await registry.execute(tasks[2]!, data, signal)).series).toEqual([9])
    expect(other).toHaveBeenCalledOnce()
    registry.dispose()
  })

  it('serializes calculation failures without losing plot diagnostics', async () => {
    const source = new FakeCalculationSource([
      createTestInstance({ instanceId: 'bad', definitionId: 'bad' }),
    ])
    const registry = new IndicatorCalculatorRegistry([
      {
        definitionId: 'bad',
        dependency: STATEFUL,
        compute: () => {
          throw Object.assign(new Error('invalid plot'), {
            code: 'TEST_PLOT',
            plotId: 'line',
            barIndex: 1,
          })
        },
      },
    ])
    const result = await registry.execute(
      source.calculationPlan().tasks[0]!,
      snapshot(createTestData(2)),
      new AbortController().signal,
    )
    expect(structuredClone(result).error).toEqual({
      message: 'invalid plot',
      code: 'TEST_PLOT',
      plotId: 'line',
      barIndex: 1,
    })
    registry.dispose()
  })

  it('passes the dependency-derived range to compute', async () => {
    const source = new FakeCalculationSource([
      createTestInstance({ instanceId: 'range', definitionId: 'range' }),
    ])
    const compute = vi.fn(() => [])
    const registry = new IndicatorCalculatorRegistry([
      { definitionId: 'range', dependency: { kind: 'stateless', lookback: 2 }, compute },
    ])
    const task = source.calculationPlan().tasks[0]!
    registry.retain([task])
    const data = createTestData(10)
    await registry.execute(
      task,
      {
        dataRevision: 1,
        marketRevision: 0,
        timestamps: data.map((item) => item.timestamp),
        data,
        change: { start: 5, end: 6 },
      },
      new AbortController().signal,
    )
    expect(compute).toHaveBeenCalledWith(data, {}, undefined, { start: 3, end: 8 })
    registry.dispose()
  })

  it('rejects unavailable definitions', async () => {
    const registry = new IndicatorCalculatorRegistry()
    const task = new FakeCalculationSource([
      createTestInstance({ instanceId: 'missing', definitionId: 'missing' }),
    ]).calculationPlan().tasks[0]!
    await expect(
      registry.execute(task, snapshot([]), new AbortController().signal),
    ).rejects.toThrow('Unknown indicator definition')
  })
})
