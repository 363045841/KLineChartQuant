/** 单任务执行契约：计算器隔离、定义替换、错误输出和有效数据边界。 */
import { describe, expect, it, vi } from 'vitest'
import { findInstanceFirstReadyIndex } from '../instances/execution/instanceCalculationRuntime.js'
import { IndicatorInstanceExecutionRuntime } from '../instances/execution/instanceExecutionRuntime.js'
import {
  createTestData,
  createTestInstance,
  FakeCalculationSource,
} from './helpers/instanceTestKit.js'

describe('indicator execution repository', () => {
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
      { definitionId: 'value', compute: () => [], createCompute: factory },
      { definitionId: 'other', compute: other },
    ])
    const tasks = source.calculationPlan().tasks
    const data = createTestData(1)
    const signal = new AbortController().signal
    runtime.retain(tasks)
    expect((await runtime.execute(tasks[0]!, data, signal)).series).toEqual([1])
    expect((await runtime.execute(tasks[1]!, data, signal)).series).toEqual([2])
    await runtime.execute(tasks[0]!, data, signal)
    expect(factory).toHaveBeenCalledTimes(2)
    runtime.updateDefinition({ definitionId: 'value', compute: () => [3] })
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
      createTestData(2),
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

  it('derives warmup from aligned data and rejects unavailable definitions', async () => {
    expect(findInstanceFirstReadyIndex({ series: [undefined, 2, 3] }, 3)).toBe(1)
    expect(findInstanceFirstReadyIndex([1, 2], 3)).toBeNull()
    const runtime = new IndicatorInstanceExecutionRuntime()
    const task = new FakeCalculationSource([
      createTestInstance({ instanceId: 'missing', definitionId: 'missing' }),
    ]).calculationPlan().tasks[0]!
    await expect(runtime.execute(task, [], new AbortController().signal)).rejects.toThrow(
      'Unknown indicator definition',
    )
  })
})
