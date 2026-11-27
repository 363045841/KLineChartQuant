/** Worker 资源验收：连续执行复用编译，显式中断/故障才重建，不跨任务传播。 */

import type { IndicatorSeries } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it, vi } from 'vitest'
import { compileSources } from '../../execution/impl/compileSources.js'
import { prepareNative } from '../../__tests__/backends.js'
import { createScriptWorkerPool } from '../impl/createScriptWorkerPool.js'
import { packIndicatorSeries } from '../transport/impl/series.js'
import type {
  ScriptThread,
  ScriptWorkerRequest,
  ScriptWorkerResponse,
} from '../types.js'

const SOURCE =
  'defineIndicator({ version: 2, name:"PoolTest", position:Position.main, onBar(){} })'
const EMPTY_SERIES: IndicatorSeries = { plots: [], fills: [] }

/** 一次运行的完成控制；用例决定何时成功或失败。 */
interface RunCall {
  readonly id: string
  finish(): void
  fail(message: string): void
}

/** 协议级假线程：只按消息协议应答，用来观察调度与线程回收。 */
class FakeThread implements ScriptThread {
  readonly requests: ScriptWorkerRequest[] = []
  terminated = false
  private listener: ((data: unknown) => void) | undefined
  private readonly own: RunCall[] = []

  constructor(
    private readonly definition: ReturnType<typeof prepareNative>['definition'],
    private readonly calls: RunCall[],
  ) {}

  postMessage(message: unknown): void {
    const request = message as ScriptWorkerRequest
    this.requests.push(request)
    if (request.type === 'prepare') {
      this.respond({ requestId: request.requestId, type: 'prepare', definition: this.definition })
      return
    }
    if (request.type === 'release') {
      this.respond({ requestId: request.requestId, type: 'release' })
      return
    }
    if (request.type === 'run') {
      const call: RunCall = {
        id: request.id,
        finish: () =>
          this.respond({
            requestId: request.requestId,
            type: 'run',
            series: packIndicatorSeries(EMPTY_SERIES),
            drawingDelta: {
              reset: false,
              remove: [],
              series: packIndicatorSeries(EMPTY_SERIES),
            },
            alerts: [],
          }),
        fail: (message) =>
          this.respond({
            requestId: request.requestId,
            type: 'error',
            error: { name: 'Error', message },
          }),
      }
      this.own.push(call)
      this.calls.push(call)
    }
  }

  onMessage(listener: (data: unknown) => void): void {
    this.listener = listener
  }

  onError(): void {}

  onMessageError(): void {}

  terminate(): void {
    this.terminated = true
    for (const call of this.own.splice(0)) call.fail('terminated')
  }

  private respond(response: ScriptWorkerResponse): void {
    this.listener?.(response)
  }
}

/** 编译线程替身：对任意源码返回同一份编译产物。 */
class FakeCompilerThread implements ScriptThread {
  terminated = false
  private listener: ((data: unknown) => void) | undefined

  constructor(private readonly module: ReturnType<typeof compileSources>) {}

  postMessage(message: unknown): void {
    const request = message as { requestId: number }
    this.listener?.({ requestId: request.requestId, type: 'compiled', module: this.module })
  }

  onMessage(listener: (data: unknown) => void): void {
    this.listener = listener
  }

  onError(): void {}

  onMessageError(): void {}

  terminate(): void {
    this.terminated = true
  }
}

/** 只控制计算完成时刻；线程仍按真实消息协议应答。 */
function setup(size: number) {
  const definition = prepareNative(SOURCE).definition
  const module = compileSources(SOURCE, [])
  const calls: RunCall[] = []
  const threads: FakeThread[] = []
  const pool = createScriptWorkerPool({
    size,
    onOutput: () => {},
    createCompilerThread: () => new FakeCompilerThread(module),
    createThread: () => {
      const thread = new FakeThread(definition, calls)
      threads.push(thread)
      return thread
    },
  })
  return { pool, calls, threads }
}

describe('long-lived script workers', () => {
  it('releases idle execution handles immediately without waiting for another task', async () => {
    const h = setup(1)
    try {
      await h.pool.prepare('a', SOURCE)
      await h.pool.release('a')
      expect(h.threads[0]!.requests.some((request) => request.type === 'release')).toBe(true)
      expect(h.threads[0]!.terminated).toBe(true)
      await h.pool.prepare('b', SOURCE)
      expect(h.threads).toHaveLength(2)
    } finally {
      h.pool.dispose()
    }
  })

  it('repeated calculations reuse the same thread and compiled script', async () => {
    const h = setup(2)
    try {
      await h.pool.prepare('a', SOURCE)
      for (let index = 0; index < 3; index++) {
        const run = h.pool.run('a', [])
        await vi.waitFor(() => expect(h.calls).toHaveLength(index + 1))
        h.calls[index]!.finish()
        await run
      }
      expect(h.threads).toHaveLength(1)
      // 首次运行前只有两次准备：元数据读取与执行会话安装；后续运行不再编译。
      const prepares = h.threads[0]!.requests.filter((request) => request.type === 'prepare')
      expect(prepares).toHaveLength(2)
      expect(h.threads[0]!.terminated).toBe(false)
    } finally {
      h.pool.dispose()
    }
  })

  it('bounded slots run independently and completion starts the next queued task', async () => {
    const h = setup(2)
    try {
      await h.pool.prepare('a', SOURCE)
      const first = h.pool.run('a', [])
      const second = h.pool.run('a', [])
      const third = h.pool.run('a', [])
      await vi.waitFor(() => expect(h.calls).toHaveLength(2))
      expect(h.threads).toHaveLength(2)
      h.calls[1]!.finish()
      await second
      await vi.waitFor(() => expect(h.calls).toHaveLength(3))
      h.calls[2]!.finish()
      await third
      h.calls[0]!.finish()
      await first
    } finally {
      h.pool.dispose()
    }
  })

  it('queued cancellation preserves the thread, explicit running cancellation replaces only its slot', async () => {
    const h = setup(1)
    try {
      await h.pool.prepare('a', SOURCE)
      const active = new AbortController()
      const queued = new AbortController()
      const first = h.pool.run('a', [], {}, undefined, undefined, active.signal)
      const firstRejected = expect(first).rejects.toMatchObject({ name: 'AbortError' })
      const second = h.pool.run('a', [], {}, undefined, undefined, queued.signal)
      const secondRejected = expect(second).rejects.toMatchObject({ name: 'AbortError' })
      await vi.waitFor(() => expect(h.calls).toHaveLength(1))
      queued.abort()
      await secondRejected
      expect(h.threads[0]!.terminated).toBe(false)
      active.abort()
      await firstRejected
      expect(h.threads[0]!.terminated).toBe(true)
      const next = h.pool.run('a', [])
      await vi.waitFor(() => expect(h.calls).toHaveLength(2))
      expect(h.threads).toHaveLength(2)
      h.calls[1]!.finish()
      await next
    } finally {
      h.pool.dispose()
    }
  })

  it('script errors and releasing another script preserve existing compiled work', async () => {
    const h = setup(1)
    try {
      await h.pool.prepare('a', SOURCE)
      await h.pool.prepare('b', SOURCE)
      const failed = h.pool.run('a', [])
      const rejected = expect(failed).rejects.toThrow('bad expression')
      await vi.waitFor(() => expect(h.calls).toHaveLength(1))
      h.calls[0]!.fail('bad expression')
      await rejected
      await h.pool.release('b')
      const next = h.pool.run('a', [])
      await vi.waitFor(() => expect(h.calls).toHaveLength(2))
      h.calls[1]!.finish()
      await next
      expect(h.threads).toHaveLength(1)
      // a 与 b 各一次元数据准备，加 a 首次运行时的一次执行安装。
      const prepares = h.threads[0]!.requests.filter((request) => request.type === 'prepare')
      expect(prepares).toHaveLength(3)
      expect(h.threads[0]!.terminated).toBe(false)
    } finally {
      h.pool.dispose()
    }
  })
})
