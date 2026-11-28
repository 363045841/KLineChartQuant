/** Worker 池：任务排队、槽位上限与句柄所在线程的唯一归属。 */
import type { QuickJSLibrary, QuickJSScriptDefinition } from '../../quickjs/types.js'
import type { CompilationHost } from '../compiler/types.js'
import { createCompilerHost } from '../compiler/impl/compilerHost.js'
import type {
  ScriptWorker,
  ScriptWorkerPool,
  ScriptWorkerPoolOptions,
} from '../types.js'
import { ScriptThreadFailure } from '../types.js'
import { createScriptWorker } from './createScriptWorker.js'

/** 已注册句柄：源码快照与当前所在槽位；槽位丢失时下一次运行重新安装。 */
interface Source {
  readonly code: string
  readonly libraries?: readonly QuickJSLibrary[]
  readonly trusted: boolean
  slot?: Slot
}

interface Slot {
  worker?: ScriptWorker
  active?: Job
  /** 本线程已安装的句柄；决定脚本驻留在哪条线程。 */
  readonly ids: Set<string>
}

interface Job {
  readonly id: string
  /** 有归属槽位时只能在该槽执行；无归属时可落到任意空闲槽。 */
  readonly slot?: Slot
  start(slot: Slot): void
  cancel(): void
}

/**
 * 创建脚本线程池。
 *
 * 线程数量、线程实现与编译线程都由宿主给出；池持有编译宿主并在销毁时一并关闭。
 *
 * @param options - 线程工厂、池大小与输出回调
 */
export function createScriptWorkerPool(options: ScriptWorkerPoolOptions): ScriptWorkerPool {
  const { size } = options
  if (!Number.isInteger(size) || size < 1)
    throw new RangeError('Worker pool size must be a positive integer')
  const compiler: CompilationHost = createCompilerHost({
    createThread: options.createCompilerThread,
  })
  const slots: Slot[] = Array.from({ length: size }, () => ({ ids: new Set() }))
  const handles = new Map<string, Source>()
  const queue: Job[] = []
  let disposed = false
  const cancelled = () => new DOMException('Script task cancelled', 'AbortError')

  /** 线程失效：脚本运行态随线程消失，句柄失去归属，下一次运行重新安装。 */
  function reset(slot: Slot): void {
    slot.worker?.dispose()
    slot.worker = undefined
    for (const id of slot.ids) {
      const source = handles.get(id)
      if (source?.slot === slot) source.slot = undefined
    }
    slot.ids.clear()
  }

  /** 空闲槽位领取队首任务；有归属的任务只等自己的槽位，无归属的落到负载最低的槽。 */
  function pump(): void {
    if (disposed) return
    for (;;) {
      let chosenIndex = -1
      let chosenSlot: Slot | undefined
      for (let index = 0; index < queue.length; index++) {
        const job = queue[index]!
        const candidates = slots.filter(
          (slot) => !slot.active && (job.slot === undefined || job.slot === slot),
        )
        if (candidates.length === 0) continue
        chosenIndex = index
        chosenSlot = candidates.reduce((left, right) => (left.ids.size <= right.ids.size ? left : right))
        break
      }
      if (!chosenSlot) return
      const [job] = queue.splice(chosenIndex, 1)
      chosenSlot.active = job!
      job!.start(chosenSlot)
    }
  }

  /** 一个任务独占槽位，跨 await 始终检查槽位身份，防止取消后继续使用新线程。 */
  function schedule<T>(
    id: string,
    run: (worker: ScriptWorker, definition: QuickJSScriptDefinition | undefined) => Promise<T>,
    signal?: AbortSignal,
    preferred?: Slot,
    refresh = false,
  ): Promise<T> {
    if (disposed) return Promise.reject(new Error('Script Worker 池已销毁'))
    if (signal?.aborted) return Promise.reject(signal.reason)
    const task = new Promise<T>((resolve, reject) => {
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
      const job: Job = {
        id,
        ...(preferred === undefined ? {} : { slot: preferred }),
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
              if (settled || assigned !== slot || slot.active !== job) throw cancelled()
              if (!slot.worker) {
                slot.worker = createScriptWorker(
                  options.createThread(),
                  options.onOutput,
                  compiler,
                )
              }
              const definition = await install(slot, id, refresh)
              return run(slot.worker, definition)
            })
            .then(
              (value) => finish(() => resolve(value)),
              (error) => {
                if (!settled && error instanceof ScriptThreadFailure) reset(slot)
                finish(() => reject(error))
              },
            )
        },
      }
      signal?.addEventListener('abort', job.cancel, { once: true })
      queue.push(job)
      pump()
    })
    // 宿主可能已经放弃这次计算；标记为已处理，但 await 仍能拿到真实错误。
    void task.catch(() => {})
    return task
  }

  /** 句柄在本线程缺失时安装一次；源码由池持有，线程只接收数据。 */
  async function install(
    slot: Slot,
    id: string,
    refresh: boolean,
  ): Promise<QuickJSScriptDefinition | undefined> {
    if (!refresh && slot.ids.has(id)) return undefined
    const source = handles.get(id)
    if (!source) throw new Error(`Script not prepared: ${id}`)
    const definition = await slot.worker!.prepare(id, source.code, source.libraries, source.trusted)
    if (source.slot && source.slot !== slot) throw new Error(`脚本已归属其它线程：${id}`)
    source.slot = slot
    slot.ids.add(id)
    return definition
  }

  /** 句柄查找失败作为异步错误返回，不创建无源码的计算任务。 */
  function use<T>(
    id: string,
    run: (worker: ScriptWorker) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (disposed) return Promise.reject(new Error('Script Worker 池已销毁'))
    const source = handles.get(id)
    return source
      ? schedule(id, run, signal, source.slot)
      : Promise.reject(new Error(`Script not prepared: ${id}`))
  }

  return {
    async prepare(id, code, libraries, trusted = false) {
      const source: Source = { code, libraries, trusted }
      handles.set(id, source)
      try {
        const definition = await schedule(
          id,
          async (_worker, prepared) => prepared!,
          undefined,
          undefined,
          true,
        )
        // 重新准备成功后清掉旧线程上的会话；句柄只归属一个线程。
        await Promise.all(
          slots.map((slot) => {
            if (slot === source.slot || !slot.ids.delete(id)) return undefined
            return slot.worker?.release(id)
          }),
        )
        return definition
      } catch (error) {
        if (handles.get(id) === source) handles.delete(id)
        throw error
      }
    },

    run: (id, input) => use(id, (worker) => worker.run(id, input), input.signal),

    requests: (id, input) => use(id, (worker) => worker.requests(id, input), input.signal),

    async release(id) {
      const source = handles.get(id)
      handles.delete(id)
      for (const job of [...queue, ...slots.flatMap((slot) => (slot.active ? [slot.active] : []))])
        if (job.id === id) job.cancel()
      pump()
      await Promise.all(
        slots.map((slot) => {
          if (!slot.ids.delete(id)) return undefined
          if (source?.slot === slot) source.slot = undefined
          return slot.worker?.release(id)
        }),
      )
    },

    dispose() {
      if (disposed) return
      disposed = true
      for (const job of [...queue, ...slots.flatMap((slot) => (slot.active ? [slot.active] : []))])
        job.cancel()
      for (const slot of slots) reset(slot)
      handles.clear()
      compiler.dispose()
    },
  }
}
