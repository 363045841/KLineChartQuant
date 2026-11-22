/** 行为验收：连续行情合并、独立发布、生命周期取消、预览提交与加载状态。 */

import type { IndicatorMarketContext } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it, vi } from 'vitest'
import type { KLineData } from '@/foundation/types/price.js'
import { createIndicatorCalculationKey } from '../instances/domain/indicatorModel.js'
import { createIndicatorCalculationScheduler } from '../instances/execution/indicatorCalculationScheduler.js'
import { createIndicatorExecutor } from '../instances/execution/indicatorExecutor.js'
import { createIndicatorResultStore } from '../instances/execution/indicatorResultStore.js'
import type { MarketSnapshot } from '../instances/execution/types.js'
import {
  createTestData,
  createTestInstance,
  createTestSnapshot,
  FakeCalculationSource,
} from './helpers/instanceTestKit.js'

interface Call {
  readonly data: readonly KLineData[]
  readonly signal: AbortSignal
  finish(value: number[]): void
}

const STATEFUL = Object.freeze({ kind: 'stateful' } as const)

/** 真实执行器搭配可控慢计算；只控制外部完成时刻，不模拟调度实现。 */
function setup(shared = false) {
  const calls: Call[] = []
  const source = new FakeCalculationSource([
    createTestInstance({ instanceId: 'slow', definitionId: 'slow' }),
    createTestInstance({ instanceId: 'fast', definitionId: 'fast' }),
    ...(shared ? [createTestInstance({ instanceId: 'copy', definitionId: 'slow' })] : []),
  ])
  const compute = (data: readonly KLineData[], _inputs: unknown, market?: IndicatorMarketContext) =>
    new Promise<number[]>((finish) => {
      if (!market?.signal) throw new Error('Missing lifecycle signal')
      calls.push({ data, signal: market.signal, finish })
    })
  const executor = createIndicatorExecutor(
    [
      { definitionId: 'slow', dependency: STATEFUL, compute },
      {
        definitionId: 'fast',
        dependency: STATEFUL,
        compute: (data) => data.map((bar) => bar.close),
      },
    ],
    () => ({
      revision: 0,
      retain() {},
      context: () => ({ symbol: 'TEST', loadBars: async () => [] }),
    }),
  )
  const commits: number[] = []
  const loading = new Set<string>()
  const store = createIndicatorResultStore()
  const scheduler = createIndicatorCalculationScheduler({
    pipeline: source,
    executor,
    store,
    onCommit: (pool) => commits.push(pool.results.size),
    onPending(ids, pending) {
      for (const id of ids) {
        if (pending) loading.add(id)
        else loading.delete(id)
      }
    },
  })
  const snapshot = (revision: number): MarketSnapshot => {
    const data = createTestData(2).map((bar) => ({ ...bar, close: revision }))
    return {
      dataRevision: revision,
      marketRevision: 0,
      data,
      timestamps: data.map((bar) => bar.timestamp),
      change: { start: 0, end: data.length },
    }
  }
  const update = (revision: number) => scheduler.refresh(snapshot(revision))
  return {
    source,
    executor,
    scheduler,
    store,
    calls,
    commits,
    loading,
    snapshot,
    update,
    dispose() {
      scheduler.dispose()
      executor.dispose()
    },
  }
}

describe('indicator calculation scheduling', () => {
  it('a burst keeps the running calculation alive and executes only the latest waiting input', async () => {
    const h = setup()
    try {
      h.update(1)
      await vi.waitFor(() => expect(h.calls).toHaveLength(1))
      for (let revision = 2; revision <= 31; revision++) h.update(revision)
      expect(h.calls).toHaveLength(1)
      expect(h.calls[0]!.signal.aborted).toBe(false)
      h.calls[0]!.finish([1, 1])
      await vi.waitFor(() => expect(h.calls).toHaveLength(2))
      expect(h.calls[1]!.data[0]!.close).toBe(31)
      expect(h.store.get('slow:{}:{}')!.dataRevision).toBe(1)
      expect(h.loading.has('slow')).toBe(true)
      h.calls[1]!.finish([31, 31])
      await vi.waitFor(() => expect(h.loading.size).toBe(0))
      expect(h.store.get('slow:{}:{}')!.series).toEqual([31, 31])
      expect(h.calls.every((call) => !call.signal.aborted)).toBe(true)
    } finally {
      h.dispose()
    }
  })

  it('fast results publish during slow preparation and shared instances use one calculation', async () => {
    const h = setup(true)
    try {
      h.update(1)
      await vi.waitFor(() => expect(h.store.get('fast:{}:{}')).toBeDefined())
      expect(h.loading.has('fast')).toBe(false)
      expect([...h.loading].sort()).toEqual(['copy', 'slow'])
      expect(h.calls).toHaveLength(1)
      h.calls[0]!.finish([7, 8])
      await vi.waitFor(() => expect(h.store.get('slow:{}:{}')).toBeDefined())
      expect(h.store.get('slow:{}:{}')!.series).toEqual([7, 8])
      h.update(1)
      expect(h.calls).toHaveLength(1)
    } finally {
      h.dispose()
    }
  })

  it('input replacement cancels the removed identity and rejects its late result', async () => {
    const h = setup()
    try {
      h.update(1)
      await vi.waitFor(() => expect(h.calls).toHaveLength(1))
      h.source.replace(
        createTestSnapshot(
          [createTestInstance({ instanceId: 'slow', definitionId: 'slow', inputs: { rows: 20 } })],
          { calculationRevision: 1, presentationRevision: 0 },
        ),
      )
      h.update(2)
      await vi.waitFor(() => expect(h.calls).toHaveLength(2))
      expect(h.calls[0]!.signal.aborted).toBe(true)
      h.calls[1]!.finish([20])
      await vi.waitFor(() => expect(h.store.get('slow:{"rows":20}:{}')).toBeDefined())
      expect(h.store.get('slow:{"rows":20}:{}')!.series).toEqual([20])
      expect(h.store.get('slow:{}:{}')).toBeUndefined()
    } finally {
      h.dispose()
    }
  })

  it('scope reset releases pending work and old completion cannot affect the new scope', async () => {
    const h = setup()
    h.update(1)
    await vi.waitFor(() => expect(h.calls).toHaveLength(1))
    h.scheduler.invalidate()
    expect(h.calls[0]!.signal.aborted).toBe(true)
    expect(h.loading.size).toBe(0)
    h.update(2)
    await vi.waitFor(() => expect(h.calls).toHaveLength(2))
    h.calls[0]!.finish([999])
    expect(h.loading.has('slow')).toBe(true)
    h.calls[1]!.finish([2])
    await vi.waitFor(() => expect(h.store.get('slow:{}:{}')!.series).toEqual([2]))
    h.dispose()
  })

  it('failure is published as a result, ends loading, and recovers on the next input', async () => {
    let fail = true
    const source = new FakeCalculationSource([
      createTestInstance({ instanceId: 'value', definitionId: 'value' }),
    ])
    const executor = createIndicatorExecutor([
      {
        definitionId: 'value',
        dependency: STATEFUL,
        compute: () => {
          if (fail) throw new Error('source unavailable')
          return [42]
        },
      },
    ])
    const states: boolean[] = []
    const store = createIndicatorResultStore()
    const scheduler = createIndicatorCalculationScheduler({
      pipeline: source,
      executor,
      store,
      onCommit: () => undefined,
      onPending: (_ids, pending) => states.push(pending),
    })
    const data = createTestData(1)
    const snapshot = (revision: number): MarketSnapshot => ({
      dataRevision: revision,
      marketRevision: 0,
      data,
      timestamps: [data[0]!.timestamp],
      change: { start: 0, end: data.length },
    })
    scheduler.refresh(snapshot(1))
    await vi.waitFor(() => expect(store.get('value:{}:{}')?.error).toBeDefined())
    expect(states.at(-1)).toBe(false)
    expect(store.get('value:{}:{}')!.error!.message).toBe('source unavailable')
    fail = false
    scheduler.refresh(snapshot(2))
    await vi.waitFor(() => expect(store.get('value:{}:{}')!.series).toEqual([42]))
    expect(store.get('value:{}:{}')!.error).toBeUndefined()
    scheduler.dispose()
    executor.dispose()
  })

  it('preview submission computes one identity into the shared store without touching the chart pool', async () => {
    const h = setup()
    try {
      h.update(1)
      await vi.waitFor(() => expect(h.calls).toHaveLength(1))
      h.calls[0]!.finish([1, 1])
      await vi.waitFor(() => expect(h.store.get('slow:{}:{}')).toBeDefined())
      const commitsBefore = h.commits.length
      const task = {
        calculationKey: createIndicatorCalculationKey({
          definitionId: 'slow',
          inputs: { rows: 5 },
          context: {},
        }),
        definitionId: 'slow',
        inputs: { rows: 5 },
        context: {},
        instanceIds: [],
      }
      const preview = h.scheduler.submit(task, h.snapshot(1))
      await vi.waitFor(() => expect(h.calls).toHaveLength(2))
      expect(h.calls[1]!.data[0]!.close).toBe(1)
      h.calls[1]!.finish([5, 5])
      const result = await preview
      expect(result.series).toEqual([5, 5])
      expect(h.store.get('slow:{"rows":5}:{}')!.series).toEqual([5, 5])
      expect(h.commits).toHaveLength(commitsBefore)
      const cached = await h.scheduler.submit(task, h.snapshot(1))
      expect(cached.series).toEqual([5, 5])
      expect(h.calls).toHaveLength(2)
    } finally {
      h.dispose()
    }
  })
})
