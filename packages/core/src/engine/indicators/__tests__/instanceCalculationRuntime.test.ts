/** 单任务执行契约：计算器隔离、定义替换、错误输出和有效数据边界。 */

import { describe, expect, it, vi } from 'vitest'
import type { KLineData } from '@/foundation/types/price.js'
import { findInstanceFirstReadyIndex } from '../instances/execution/instanceCalculationRuntime.js'
import { IndicatorInstanceExecutionRuntime } from '../instances/execution/instanceExecutionRuntime.js'
import type { IndicatorCalculationInput } from '../instances/execution/types.js'
import {
  createTestData,
  createTestInstance,
  FakeCalculationSource,
} from './helpers/instanceTestKit.js'

/** 测试输入：整段变化，依赖按有状态处理。 */
function input(data: readonly KLineData[]): IndicatorCalculationInput {
  return {
    dataRevision: 0,
    timestamps: data.map((item) => item.timestamp),
    data,
    change: { start: 0, end: data.length },
  }
}

const STATEFUL = Object.freeze({ kind: 'stateful' } as const)

describe('indicator execution repository', () => {
  it('disposes only calculators whose identity leaves the plan and releases the remainder on shutdown', async () => {
    const source = new FakeCalculationSource([
      createTestInstance({ instanceId: 'a', definitionId: 'value', params: { period: 1 } }),
      createTestInstance({ instanceId: 'b', definitionId: 'value', params: { period: 2 } }),
    ])
    const disposals: ReturnType<typeof vi.fn>[] = []
    const runtime = new IndicatorInstanceExecutionRuntime([
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
      await runtime.execute(task, input(createTestData(1)), new AbortController().signal)
    runtime.retain([tasks[1]!])
    expect(disposals[0]).toHaveBeenCalledOnce()
    expect(disposals[1]).not.toHaveBeenCalled()
    runtime.retain([tasks[1]!])
    runtime.dispose()
    runtime.dispose()
    expect(disposals[0]).toHaveBeenCalledOnce()
    expect(disposals[1]).toHaveBeenCalledOnce()
  })

  it('reuses calculators per identity and replaces only the edited definition', async () => {
    const source = new FakeCalculationSource([
      createTestInstance({ instanceId: 'a', definitionId: 'value', params: { period: 1 } }),
      createTestInstance({ instanceId: 'b', definitionId: 'value', params: { period: 2 } }),
      createTestInstance({ instanceId: 'c', definitionId: 'other' }),
    ])
    const factory = vi.fn(() => (_data: unknown, params: Readonly<Record<string, unknown>>) => [
      params.period,
    ])
    const other = vi.fn(() => [9])
    const runtime = new IndicatorInstanceExecutionRuntime([
      { definitionId: 'value', dependency: STATEFUL, compute: () => [], createCompute: factory },
      { definitionId: 'other', dependency: STATEFUL, compute: other },
    ])
    const tasks = source.calculationPlan().tasks
    const data = input(createTestData(1))
    const signal = new AbortController().signal
    runtime.retain(tasks)
    expect((await runtime.execute(tasks[0]!, data, signal)).series).toEqual([1])
    expect((await runtime.execute(tasks[1]!, data, signal)).series).toEqual([2])
    await runtime.execute(tasks[0]!, data, signal)
    expect(factory).toHaveBeenCalledTimes(2)
    runtime.updateDefinition({ definitionId: 'value', dependency: STATEFUL, compute: () => [3] })
    expect((await runtime.execute(tasks[0]!, data, signal)).series).toEqual([3])
    expect((await runtime.execute(tasks[2]!, data, signal)).series).toEqual([9])
    expect(other).toHaveBeenCalledOnce()
    runtime.dispose()
  })

  it('serializes calculation failures without losing plot diagnostics', async () => {
    const source = new FakeCalculationSource([
      createTestInstance({ instanceId: 'bad', definitionId: 'bad' }),
    ])
    const runtime = new IndicatorInstanceExecutionRuntime([
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
    const result = await runtime.execute(
      source.calculationPlan().tasks[0]!,
      input(createTestData(2)),
      new AbortController().signal,
    )
    expect(structuredClone(result).error).toEqual({
      message: 'invalid plot',
      code: 'TEST_PLOT',
      plotId: 'line',
      barIndex: 1,
    })
    runtime.dispose()
  })

  it('passes the dependency-derived range to compute', async () => {
    const source = new FakeCalculationSource([
      createTestInstance({ instanceId: 'range', definitionId: 'range' }),
    ])
    const compute = vi.fn(() => [])
    const runtime = new IndicatorInstanceExecutionRuntime([
      { definitionId: 'range', dependency: { kind: 'stateless', lookback: 2 }, compute },
    ])
    const task = source.calculationPlan().tasks[0]!
    runtime.retain([task])
    const data = createTestData(10)
    await runtime.execute(
      task,
      {
        dataRevision: 1,
        timestamps: data.map((item) => item.timestamp),
        data,
        change: { start: 5, end: 6 },
      },
      new AbortController().signal,
    )
    expect(compute).toHaveBeenCalledWith(data, {}, undefined, { start: 3, end: 8 })
    runtime.dispose()
  })

  it('derives warmup from aligned data and rejects unavailable definitions', async () => {
    expect(findInstanceFirstReadyIndex({ series: [undefined, 2, 3] }, 3)).toBe(1)
    expect(findInstanceFirstReadyIndex([1, 2], 3)).toBeNull()
    const runtime = new IndicatorInstanceExecutionRuntime()
    const task = new FakeCalculationSource([
      createTestInstance({ instanceId: 'missing', definitionId: 'missing' }),
    ]).calculationPlan().tasks[0]!
    await expect(runtime.execute(task, input([]), new AbortController().signal)).rejects.toThrow(
      'Unknown indicator definition',
    )
  })
})
