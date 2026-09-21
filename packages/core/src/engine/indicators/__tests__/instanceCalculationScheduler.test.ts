/**
 * 实例计算调度器测试：请求版本门控、过期结果丢弃、失败上报与结果保留语义。
 */
import { describe, expect, it, vi } from 'vitest'

import { createInlineIndicatorCalculationExecutor } from '../instances/execution/instanceCalculationExecutors'
import {
  createInstanceCalculationScheduler,
  type InstanceCalculationCommit,
} from '../instances/execution/instanceCalculationScheduler'
import {
  createControlledExecutor,
  createOutputs,
  createTestData,
  createTestInstance,
  createTestSnapshot,
  FakeCalculationSource,
} from './helpers/instanceTestKit'

describe('createInstanceCalculationScheduler', () => {
  it('使用 inline 执行器提交按实例索引的结果池', async () => {
    const executor = createInlineIndicatorCalculationExecutor([
      {
        definitionId: 'ma',
        compute: (data, params) => {
          const period = typeof params.period === 'number' ? params.period : 0
          return data.map((item, index) => (index < period ? undefined : item.close))
        },
      },
    ])
    const source = new FakeCalculationSource([
      createTestInstance({
        instanceId: 'ma-a',
        definitionId: 'ma',
        params: { period: 2 },
      }),
    ])
    const commits: InstanceCalculationCommit[] = []
    const onError = vi.fn()
    const scheduler = createInstanceCalculationScheduler({
      pipeline: source,
      executor,
      onCommit: (commit) => commits.push(commit),
      onError,
    })
    const data = createTestData(4)

    const committed = await scheduler.compute({
      dataRevision: 7,
      timestamps: data.map((item) => item.timestamp),
      data,
    })

    expect(committed).toBe(true)
    expect(onError).not.toHaveBeenCalled()
    expect(commits).toHaveLength(1)
    const { pool } = commits[0]!
    expect(commits[0]!.requestId).toBe(1)
    expect(pool.dataRevision).toBe(7)
    expect(pool.instanceRevision).toBe(source.snapshot().calculationRevision)
    expect(pool.timestamps).toEqual(data.map((item) => item.timestamp))
    const result = pool.results.get('ma-a')!
    expect(result.firstReadyIndex).toBe(2)
    expect(result.series).toEqual([undefined, undefined, 102, 103])
  })

  it('丢弃在更新请求之后返回的过期结果', async () => {
    const executor = createControlledExecutor()
    const source = new FakeCalculationSource([
      createTestInstance({ instanceId: 'ma-a', definitionId: 'ma', params: { period: 2 } }),
    ])
    const commits: InstanceCalculationCommit[] = []
    const scheduler = createInstanceCalculationScheduler({
      pipeline: source,
      executor,
      onCommit: (commit) => commits.push(commit),
    })
    const data = createTestData(4)
    const timestamps = data.map((item) => item.timestamp)

    const first = scheduler.compute({ dataRevision: 1, timestamps, data })
    const second = scheduler.compute({ dataRevision: 2, timestamps, data })
    await vi.waitFor(() => expect(executor.execute).toHaveBeenCalledTimes(2))

    executor.find(2).resolve(createOutputs(source.calculationPlan(), [10, 20, 30, 40]))
    await expect(second).resolves.toBe(true)
    executor.find(1).resolve(createOutputs(source.calculationPlan(), [1, 2, 3, 4]))
    await expect(first).resolves.toBe(false)

    expect(commits).toHaveLength(1)
    expect(commits[0]!.requestId).toBe(2)
    expect(commits[0]!.pool.results.get('ma-a')!.series).toEqual([10, 20, 30, 40])
  })

  it('实例计算版本在执行期间变化时丢弃结果', async () => {
    const executor = createControlledExecutor()
    const source = new FakeCalculationSource([
      createTestInstance({ instanceId: 'ma-a', definitionId: 'ma', params: { period: 2 } }),
    ])
    const commits: InstanceCalculationCommit[] = []
    const scheduler = createInstanceCalculationScheduler({
      pipeline: source,
      executor,
      onCommit: (commit) => commits.push(commit),
    })
    const data = createTestData(4)

    const pending = scheduler.compute({
      dataRevision: 1,
      timestamps: data.map((item) => item.timestamp),
      data,
    })
    await vi.waitFor(() => expect(executor.execute).toHaveBeenCalledTimes(1))

    source.replace(
      createTestSnapshot(
        [createTestInstance({ instanceId: 'ma-a', definitionId: 'ma', params: { period: 5 } })],
        { calculationRevision: 1, presentationRevision: 0 },
      ),
    )
    executor.find(1).resolve(createOutputs(source.calculationPlan(), [1, 2, 3, 4]))

    await expect(pending).resolves.toBe(false)
    expect(commits).toHaveLength(0)
  })

  it('只上报最新请求的执行失败', async () => {
    const executor = createControlledExecutor()
    const source = new FakeCalculationSource([
      createTestInstance({ instanceId: 'ma-a', definitionId: 'ma', params: { period: 2 } }),
    ])
    const commits: InstanceCalculationCommit[] = []
    const onError = vi.fn()
    const scheduler = createInstanceCalculationScheduler({
      pipeline: source,
      executor,
      onCommit: (commit) => commits.push(commit),
      onError,
    })
    const data = createTestData(4)
    const timestamps = data.map((item) => item.timestamp)

    const first = scheduler.compute({ dataRevision: 1, timestamps, data })
    const second = scheduler.compute({ dataRevision: 2, timestamps, data })
    await vi.waitFor(() => expect(executor.execute).toHaveBeenCalledTimes(2))

    executor.find(1).reject(new Error('worker 已退出'))
    await expect(first).resolves.toBe(false)
    expect(onError).not.toHaveBeenCalled()

    executor.find(2).reject(new Error('worker 已退出'))
    await expect(second).resolves.toBe(false)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(commits).toHaveLength(0)
  })

  it('执行失败时保留上一次成功提交的结果池', async () => {
    const executor = createControlledExecutor()
    const source = new FakeCalculationSource([
      createTestInstance({ instanceId: 'ma-a', definitionId: 'ma', params: { period: 2 } }),
    ])
    const commits: InstanceCalculationCommit[] = []
    const scheduler = createInstanceCalculationScheduler({
      pipeline: source,
      executor,
      onCommit: (commit) => commits.push(commit),
      onError: vi.fn(),
    })
    const data = createTestData(4)
    const timestamps = data.map((item) => item.timestamp)

    const success = scheduler.compute({ dataRevision: 1, timestamps, data })
    await vi.waitFor(() => expect(executor.execute).toHaveBeenCalledTimes(1))
    executor.find(1).resolve(createOutputs(source.calculationPlan(), [1, 2, 3, 4]))
    await expect(success).resolves.toBe(true)

    const failure = scheduler.compute({ dataRevision: 2, timestamps, data })
    await vi.waitFor(() => expect(executor.execute).toHaveBeenCalledTimes(2))
    executor.find(2).reject(new Error('worker 已退出'))
    await expect(failure).resolves.toBe(false)

    expect(commits).toHaveLength(1)
    expect(commits[0]!.pool.dataRevision).toBe(1)
  })
})
