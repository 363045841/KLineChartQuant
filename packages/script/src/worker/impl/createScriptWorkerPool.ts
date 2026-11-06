/** 长寿命Worker池：FIFO领取任务，按线程缓存编译；只响应显式生命周期取消。 */
import type { QuickJSLibrary, QuickJSScriptDefinition } from '../../quickjs/types.js'
import type { ScriptWorker, ScriptWorkerPool, ScriptWorkerPoolOptions } from '../types.js'
import { createScriptWorker } from './createScriptWorker.js'

interface Source {
  readonly code: string
  readonly libraries?: readonly QuickJSLibrary[]
  readonly trusted: boolean
}
interface Compilation {
  readonly source: Source
  readonly definition: QuickJSScriptDefinition
}
interface Slot {
  worker?: ScriptWorker
  readonly compiled: Map<string, Compilation>
  active?: Job
}
interface Job {
  readonly id: string
  start(slot: Slot): void
  cancel(): void
}

/** 线程池不识别指标、行情版本或轻重任务，也不替调用方合并任务。 */
export function createScriptWorkerPool(options: ScriptWorkerPoolOptions = {}): ScriptWorkerPool {
  const size =
    options.size ?? Math.min(4, Math.max(2, (globalThis.navigator?.hardwareConcurrency ?? 4) - 1))
  if (!Number.isInteger(size) || size < 1)
    throw new RangeError('Worker pool size must be a positive integer')
  const slots: Slot[] = Array.from({ length: size }, () => ({ compiled: new Map() }))
  const sources = new Map<string, Source>()
  const queue: Job[] = []
  let disposed = false
  const cancelled = () => new DOMException('Script task cancelled', 'AbortError')

  /** 仅显式中断运行任务、线程故障或销毁会释放物理线程。 */
  function reset(slot: Slot): void {
    slot.worker?.dispose()
    slot.worker = undefined
    slot.compiled.clear()
  }

  /** 空闲槽位立即领取队首任务；网络取数完全发生在池外。 */
  function pump(): void {
    if (disposed) return
    for (const slot of slots) {
      if (slot.active) continue
      const job = queue.shift()
      if (!job) return
      slot.active = job
      job.start(slot)
    }
  }

  /** 一个Job独占槽位，跨await始终检查槽位身份，防止取消后继续使用新线程。 */
  function schedule<T>(
    id: string,
    source: Source,
    run: (worker: ScriptWorker, definition: QuickJSScriptDefinition) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (disposed) return Promise.reject(new Error('Script Worker pool 已销毁'))
    if (signal?.aborted) return Promise.reject(signal.reason)
    return new Promise<T>((resolve, reject) => {
      let settled = false
      let assigned: Slot | undefined
      const finish = (complete: () => void) => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', job.cancel)
        if (assigned?.active === job) assigned.active = undefined
        complete()
        pump()
      }
      const check = () => {
        if (settled || assigned?.active !== job || sources.get(id) !== source) throw cancelled()
      }
      const job: Job = {
        id,
        cancel() {
          const index = queue.indexOf(job)
          if (index >= 0) queue.splice(index, 1)
          if (assigned?.active === job) reset(assigned)
          finish(() => reject(signal?.reason ?? cancelled()))
        },
        start(slot) {
          assigned = slot
          void Promise.resolve()
            .then(async () => {
              check()
              if (!slot.worker) {
                slot.worker =
                  options.createWorker?.() ?? createScriptWorker(undefined, options.onOutput)
              }
              const worker = slot.worker
              // 释放旧脚本只影响该编译句柄，不销毁其它脚本的缓存。
              for (const cachedId of slot.compiled.keys()) {
                if (sources.has(cachedId)) continue
                await worker.release(cachedId)
                check()
                slot.compiled.delete(cachedId)
              }
              let compiled = slot.compiled.get(id)
              if (compiled?.source !== source) {
                const definition = await worker.prepare(
                  id,
                  source.code,
                  source.libraries,
                  source.trusted,
                )
                check()
                compiled = { source, definition }
                slot.compiled.set(id, compiled)
              }
              return run(worker, compiled.definition)
            })
            .then(
              (value) => finish(() => resolve(value)),
              (error) => {
                if (!settled && error instanceof Error && 'workerFailure' in error) reset(slot)
                finish(() => reject(error))
              },
            )
        },
      }
      signal?.addEventListener('abort', job.cancel, { once: true })
      queue.push(job)
      pump()
    })
  }

  /** 句柄查找失败作为异步错误返回，不创建无源码的计算任务。 */
  function use<T>(
    id: string,
    run: (worker: ScriptWorker) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (disposed) return Promise.reject(new Error('Script Worker pool 已销毁'))
    const source = sources.get(id)
    return source
      ? schedule(id, source, run, signal)
      : Promise.reject(new Error(`Script not prepared: ${id}`))
  }

  return {
    async prepare(id, code, libraries, trusted = false) {
      const source = { code, libraries, trusted }
      sources.set(id, source)
      try {
        return await schedule(id, source, async (_worker, definition) => definition)
      } catch (error) {
        if (sources.get(id) === source) sources.delete(id)
        throw error
      }
    },
    run: (id, bars, params, context, signal) =>
      use(id, (worker) => worker.run(id, bars, params, context), signal),
    requests: (id, params, symbol, signal) =>
      use(id, (worker) => worker.requests(id, params, symbol), signal),
    async release(id) {
      sources.delete(id)
      for (const job of [...queue, ...slots.flatMap((slot) => (slot.active ? [slot.active] : []))])
        if (job.id === id) job.cancel()
      // 下一次领取任务时清理失效句柄；忙碌线程不被其它脚本的释放动作打断。
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const job of [...queue, ...slots.flatMap((slot) => (slot.active ? [slot.active] : []))])
        job.cancel()
      for (const slot of slots) reset(slot)
      sources.clear()
    },
  }
}
