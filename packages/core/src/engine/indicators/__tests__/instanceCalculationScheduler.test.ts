/** 行为验收：连续行情合并、独立发布、生命周期取消和加载状态。 */

import type { IndicatorMarketContext } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it, vi } from 'vitest'
import type { KLineData } from '@/foundation/types/price.js'
import { createInlineIndicatorCalculationExecutor } from '../instances/execution/instanceCalculationExecutors.js'
import { createInstanceCalculationScheduler } from '../instances/execution/instanceCalculationScheduler.js'
import type { InstanceCalculationCommit } from '../instances/execution/types.js'
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
  const compute = (data: readonly KLineData[], _params: unknown, market?: IndicatorMarketContext) =>
    new Promise<number[]>((finish) => {
      if (!market?.signal) throw new Error('Missing lifecycle signal')
      calls.push({ data, signal: market.signal, finish })
    })
  const executor = createInlineIndicatorCalculationExecutor(
    [
      { definitionId: 'slow', dependency: STATEFUL, compute },
      { definitionId: 'fast', dependency: STATEFUL, compute: (data) => data.map((bar) => bar.close) },
    ],
    () => ({
      revision: 0,
      retain() {},
      context: () => ({ symbol: 'TEST', loadBars: async () => [] }),
    }),
  )
  const commits: InstanceCalculationCommit[] = []
  const loading = new Set<string>()
  const scheduler = createInstanceCalculationScheduler({
    pipeline: source,
    executor,
    onCommit: (commit) => commits.push(commit),
    onPending(ids, pending) {
      for (const id of ids) {
        if (pending) loading.add(id)
        else loading.delete(id)
      }
    },
  })
  const update = (revision: number) => {
    const data = createTestData(2).map((bar) => ({ ...bar, close: revision }))
    return scheduler.compute({
      dataRevision: revision,
      data,
      timestamps: data.map((bar) => bar.timestamp),
      change: { start: 0, end: data.length },
    })
  }
  return {
    source,
    executor,
    scheduler,
    calls,
    commits,
    loading,
    update,
    dispose() {
      scheduler.dispose()
      executor.dispose()
    },
  }
}

describe('independent indicator scheduling', () => {
  it('a burst keeps the running calculation alive and executes only the latest waiting input', async () => {
    const h = setup()
    try {
      const first = h.update(1)
      await vi.waitFor(() => expect(h.calls).toHaveLength(1))
      const updates = Array.from({ length: 30 }, (_, index) => h.update(index + 2))
      expect(h.calls).toHaveLength(1)
      expect(h.calls[0]!.signal.aborted).toBe(false)
      h.calls[0]!.finish([1, 1])
      await first
      await vi.waitFor(() => expect(h.calls).toHaveLength(2))
      expect(h.calls[1]!.data[0]!.close).toBe(31)
      expect(h.commits.at(-1)!.pool.results.get('slow')!.dataRevision).toBe(1)
      expect(h.loading.has('slow')).toBe(true)
      h.calls[1]!.finish([31, 31])
      await Promise.all(updates)
      await vi.waitFor(() => expect(h.loading.size).toBe(0))
      expect(h.commits.at(-1)!.pool.results.get('slow')!.series).toEqual([31, 31])
      expect(h.calls.every((call) => !call.signal.aborted)).toBe(true)
    } finally {
      h.dispose()
    }
  })

  it('fast results render during slow preparation and shared instances use one calculation', async () => {
    const h = setup(true)
    try {
      const run = h.update(1)
      await vi.waitFor(() => expect(h.commits.at(-1)!.pool.results.has('fast')).toBe(true))
      expect(h.loading.has('fast')).toBe(false)
      expect([...h.loading].sort()).toEqual(['copy', 'slow'])
      expect(h.calls).toHaveLength(1)
      h.calls[0]!.finish([7, 8])
      await run
      const pool = h.commits.at(-1)!.pool
      expect(pool.results.get('slow')!.series).toBe(pool.results.get('copy')!.series)
      await h.update(1)
      expect(h.calls).toHaveLength(1)
    } finally {
      h.dispose()
    }
  })

  it('parameter replacement cancels the removed identity and rejects its late result', async () => {
    const h = setup()
    try {
      const old = h.update(1)
      await vi.waitFor(() => expect(h.calls).toHaveLength(1))
      h.source.replace(
        createTestSnapshot(
          [createTestInstance({ instanceId: 'slow', definitionId: 'slow', params: { rows: 20 } })],
          { calculationRevision: 1, presentationRevision: 0 },
        ),
      )
      const next = h.update(2)
      await vi.waitFor(() => expect(h.calls).toHaveLength(2))
      expect(h.calls[0]!.signal.aborted).toBe(true)
      h.calls[1]!.finish([20])
      await next
      h.calls[0]!.finish([999])
      await old
      expect(h.commits.at(-1)!.pool.results.get('slow')!.series).toEqual([20])
      expect(h.commits.at(-1)!.pool.results.has('fast')).toBe(false)
    } finally {
      h.dispose()
    }
  })

  it('scope reset releases pending work and old completion cannot affect the new scope', async () => {
    const h = setup()
    const old = h.update(1)
    await vi.waitFor(() => expect(h.calls).toHaveLength(1))
    h.scheduler.invalidate()
    expect(h.calls[0]!.signal.aborted).toBe(true)
    expect(h.loading.size).toBe(0)
    const next = h.update(2)
    await vi.waitFor(() => expect(h.calls).toHaveLength(2))
    h.calls[0]!.finish([999])
    await old
    expect(h.loading.has('slow')).toBe(true)
    h.calls[1]!.finish([2])
    await next
    h.dispose()
    const count = h.commits.length
    expect(await h.update(3)).toBe(false)
    expect(h.commits).toHaveLength(count)
  })

  it('failure ends loading independently and recovers on the next input', async () => {
    let fail = true
    const source = new FakeCalculationSource([
      createTestInstance({ instanceId: 'value', definitionId: 'value' }),
    ])
    const executor = createInlineIndicatorCalculationExecutor([
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
    const commits: InstanceCalculationCommit[] = []
    const scheduler = createInstanceCalculationScheduler({
      pipeline: source,
      executor,
      onCommit: (commit) => commits.push(commit),
      onPending: (_ids, pending) => states.push(pending),
    })
    const data = createTestData(1)
    await scheduler.compute({
      dataRevision: 1,
      data,
      timestamps: [data[0]!.timestamp],
      change: { start: 0, end: data.length },
    })
    await vi.waitFor(() => expect(states.at(-1)).toBe(false))
    expect(commits.at(-1)!.pool.results.get('value')!.error!.message).toBe('source unavailable')
    fail = false
    await scheduler.compute({
      dataRevision: 2,
      data,
      timestamps: [data[0]!.timestamp],
      change: { start: 0, end: data.length },
    })
    expect(commits.at(-1)!.pool.results.get('value')!.series).toEqual([42])
    expect(commits.at(-1)!.pool.results.get('value')!.error).toBeUndefined()
    scheduler.dispose()
    executor.dispose()
  })
})
