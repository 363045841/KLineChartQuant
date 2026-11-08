/** 编译线程生命周期：保留已编译产物，空闲回收 TypeScript VM，在途请求不被回收。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { compileSources } from '../../../execution/impl/compileSources.js'
import { acquireCompilation } from '../impl/sharedCompiler.js'
import type { CompilationLease, CompilerRequest, CompilerResponse } from '../types.js'

const SOURCE = 'defineIndicator({ name:"CompilerLifecycle", position:Position.Main, onBar(){} })'
const NEXT_SOURCE = `${SOURCE}\n// next revision`
const workers: CompilerWorker[] = []
const leases: CompilationLease[] = []

/** 仅控制消息完成时刻，编译响应使用真实编译器生成的产物。 */
class CompilerWorker extends EventTarget {
  readonly requests: CompilerRequest[] = []
  readonly terminate = vi.fn()

  constructor() {
    super()
    workers.push(this)
  }

  /** 记录协议请求，由用例决定何时完成或发生线程错误。 */
  postMessage(request: CompilerRequest): void {
    this.requests.push(request)
  }

  /** 使用真实编译产物完成指定请求，覆盖成功后缓存仍可独立使用的契约。 */
  complete(index = 0): void {
    const request = this.requests[index]
    if (!request) throw new Error('missing compiler request')
    const response: CompilerResponse = {
      requestId: request.requestId,
      type: 'compiled',
      module: compileSources(request.source, request.libraries),
    }
    this.dispatchEvent(new MessageEvent('message', { data: response }))
  }

  /** 模拟物理线程故障；脚本编译错误的协议响应不属于线程故障。 */
  fail(): void {
    this.dispatchEvent(Object.assign(new Event('error'), { message: 'compiler failed' }))
  }
}

/** 跟踪租约以保证失败用例同样释放宿主，不把共享缓存带到下一个用例。 */
function acquire(source = SOURCE): CompilationLease {
  const lease = acquireCompilation(source)
  leases.push(lease)
  void lease.module.catch(() => {})
  return lease
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('Worker', CompilerWorker)
  workers.length = 0
})

afterEach(() => {
  for (const lease of leases.splice(0)) lease.release()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('shared compiler thread lifecycle', () => {
  it('reclaims the idle thread while active leases keep their shared compiled result', async () => {
    const first = acquire()
    const second = acquire()
    expect(workers).toHaveLength(1)
    const worker = workers[0]!
    expect(worker.requests).toHaveLength(1)
    worker.complete()
    const module = await first.module
    expect(await second.module).toBe(module)
    expect(worker.terminate).not.toHaveBeenCalled()
    vi.runOnlyPendingTimers()
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(await acquire().module).toBe(module)
    expect(workers).toHaveLength(1)
  })

  it('does not reclaim a thread until every concurrent request has completed', async () => {
    const first = acquire()
    const second = acquire(NEXT_SOURCE)
    const worker = workers[0]!
    worker.complete()
    await first.module
    vi.runOnlyPendingTimers()
    expect(worker.terminate).not.toHaveBeenCalled()
    worker.complete(1)
    await second.module
    vi.runOnlyPendingTimers()
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('cancels pending reclamation when a new revision arrives during the idle window', async () => {
    const first = acquire()
    const worker = workers[0]!
    worker.complete()
    await first.module
    const next = acquire(NEXT_SOURCE)
    vi.runOnlyPendingTimers()
    expect(worker.terminate).not.toHaveBeenCalled()
    expect(workers).toHaveLength(1)
    worker.complete(1)
    await next.module
    vi.runOnlyPendingTimers()
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('restarts for new source and ignores late events from the reclaimed thread', async () => {
    const first = acquire()
    const previous = workers[0]!
    previous.complete()
    await first.module
    vi.runOnlyPendingTimers()
    const next = acquire(NEXT_SOURCE)
    const current = workers[1]!
    previous.fail()
    expect(current.terminate).not.toHaveBeenCalled()
    current.complete()
    expect((await next.module).source).toContain('CompilerLifecycle')
    vi.runOnlyPendingTimers()
    expect(current.terminate).toHaveBeenCalledOnce()
  })

  it('rejects outstanding requests on failure and starts a fresh host for later work', async () => {
    const failed = acquire()
    const rejected = expect(failed.module).rejects.toThrow('compiler failed')
    workers[0]!.fail()
    await rejected
    expect(workers[0]!.terminate).toHaveBeenCalledOnce()
    const next = acquire()
    workers[1]!.complete()
    await next.module
    failed.release()
    expect(workers[1]!.terminate).not.toHaveBeenCalled()
  })

  it('releases the final lease immediately and cancels the idle timer', async () => {
    const lease = acquire()
    const worker = workers[0]!
    worker.complete()
    await lease.module
    lease.release()
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    lease.release()
    expect(worker.terminate).toHaveBeenCalledOnce()
  })
})
