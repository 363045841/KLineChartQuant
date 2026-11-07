/** Worker资源验收：连续执行复用编译，显式中断/故障才重建，不跨任务传播。 */

import type { PlotCollection } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it, vi } from 'vitest'
import { prepareNativeScript } from '../../execution/impl/prepareNativeScript.js'
import { createScriptWorkerPool } from '../impl/createScriptWorkerPool.js'
import type { ScriptWorker } from '../types.js'

/** 只控制计算完成时刻，保留ScriptWorker的实际端口契约。 */
function setup(size: number) {
  const definition = prepareNativeScript(
    'defineIndicator({ name:"PoolTest", position:Position.Main, onBar(){} })',
  ).definition
  const calls: { id: string; finish(value: PlotCollection): void; fail(error: Error): void }[] = []
  const workers: ScriptWorker[] = []
  const output: PlotCollection = { plots: [], fills: [] }
  const pool = createScriptWorkerPool({
    size,
    createWorker: () => {
      const own: typeof calls = []
      const worker: ScriptWorker = {
        prepare: vi.fn(async () => definition),
        run: vi.fn(
          (id) =>
            new Promise<PlotCollection>((finish, fail) => {
              const call = { id, finish, fail }
              own.push(call)
              calls.push(call)
            }),
        ),
        requests: vi.fn(async () => []),
        release: vi.fn(async () => {}),
        dispose: vi.fn(() => {
          for (const call of own) call.fail(new Error('terminated'))
        }),
      }
      workers.push(worker)
      return worker
    },
  })
  return { pool, calls, workers, output }
}

describe('long-lived script workers', () => {
  it('releases idle execution handles immediately without waiting for another task', async () => {
    const h = setup(1)
    try {
      await h.pool.prepare('a', 'source')
      await h.pool.release('a')
      expect(h.workers[0]!.release).toHaveBeenCalledWith('a')
      expect(h.workers[0]!.dispose).toHaveBeenCalledOnce()
      await h.pool.prepare('b', 'source-next')
      expect(h.workers).toHaveLength(2)
    } finally {
      h.pool.dispose()
    }
  })

  it('repeated calculations reuse the same worker and compiled script', async () => {
    const h = setup(2)
    try {
      await h.pool.prepare('a', 'source')
      for (let index = 0; index < 20; index++) {
        const run = h.pool.run('a', [])
        await vi.waitFor(() => expect(h.calls).toHaveLength(index + 1))
        h.calls[index]!.finish(h.output)
        await run
      }
      expect(h.workers).toHaveLength(1)
      expect(h.workers[0]!.prepare).toHaveBeenCalledOnce()
      expect(h.workers[0]!.dispose).not.toHaveBeenCalled()
    } finally {
      h.pool.dispose()
    }
  })

  it('bounded slots run independently and completion starts the next queued task', async () => {
    const h = setup(2)
    try {
      await h.pool.prepare('a', 'source')
      const first = h.pool.run('a', [])
      const second = h.pool.run('a', [])
      const third = h.pool.run('a', [])
      await vi.waitFor(() => expect(h.calls).toHaveLength(2))
      expect(h.workers).toHaveLength(2)
      h.calls[1]!.finish(h.output)
      await second
      await vi.waitFor(() => expect(h.calls).toHaveLength(3))
      h.calls[2]!.finish(h.output)
      await third
      h.calls[0]!.finish(h.output)
      await first
    } finally {
      h.pool.dispose()
    }
  })

  it('queued cancellation preserves the worker, explicit running cancellation replaces only its slot', async () => {
    const h = setup(1)
    try {
      await h.pool.prepare('a', 'source')
      const active = new AbortController()
      const queued = new AbortController()
      const first = h.pool.run('a', [], {}, undefined, undefined, active.signal)
      const firstRejected = expect(first).rejects.toMatchObject({ name: 'AbortError' })
      const second = h.pool.run('a', [], {}, undefined, undefined, queued.signal)
      const secondRejected = expect(second).rejects.toMatchObject({ name: 'AbortError' })
      await vi.waitFor(() => expect(h.calls).toHaveLength(1))
      queued.abort()
      await secondRejected
      expect(h.workers[0]!.dispose).not.toHaveBeenCalled()
      active.abort()
      await firstRejected
      expect(h.workers[0]!.dispose).toHaveBeenCalledOnce()
      const next = h.pool.run('a', [])
      await vi.waitFor(() => expect(h.calls).toHaveLength(2))
      expect(h.workers).toHaveLength(2)
      h.calls[1]!.finish(h.output)
      await next
    } finally {
      h.pool.dispose()
    }
  })

  it('script errors and releasing another script preserve existing compiled work', async () => {
    const h = setup(1)
    try {
      await h.pool.prepare('a', 'source-a')
      await h.pool.prepare('b', 'source-b')
      const failed = h.pool.run('a', [])
      const rejected = expect(failed).rejects.toThrow('bad expression')
      await vi.waitFor(() => expect(h.calls).toHaveLength(1))
      h.calls[0]!.fail(new Error('bad expression'))
      await rejected
      await h.pool.release('b')
      const next = h.pool.run('a', [])
      await vi.waitFor(() => expect(h.calls).toHaveLength(2))
      h.calls[1]!.finish(h.output)
      await next
      expect(h.workers).toHaveLength(1)
      expect(h.workers[0]!.prepare).toHaveBeenCalledTimes(2)
      expect(h.workers[0]!.dispose).not.toHaveBeenCalled()
    } finally {
      h.pool.dispose()
    }
  })
})
