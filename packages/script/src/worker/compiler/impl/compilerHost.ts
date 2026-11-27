/**
 * 编译线程宿主：同一份源码只编译一次，编译结果按引用计数复用。
 *
 * 宿主由创建它的线程池持有并释放；线程只在编译期间与结果排队期间存在。
 */
import type { CompiledScriptSources } from '../../../execution/types.js'
import type { QuickJSLibrary } from '../../../quickjs/types.js'
import type { ScriptThread } from '../../types.js'
import type {
  CompilationHost,
  CompilationLease,
  CompilerRequest,
  CompilerResponse,
} from '../types.js'

/** 编译线程空闲多久后回收；结果缓存在内存，回收不丢已编译产物。 */
const COMPILER_IDLE_MS = 1000

export interface CompilerHostOptions {
  /** 创建一条编译线程；浏览器传 Web Worker，Node 传 worker_threads。 */
  readonly createThread: () => ScriptThread
}

interface Entry {
  readonly source: string
  readonly libraries: readonly QuickJSLibrary[]
  readonly module: Promise<CompiledScriptSources>
  references: number
}

/**
 * 创建编译宿主。
 *
 * @param options - 编译线程工厂
 * @returns 由调用方负责释放的编译宿主
 */
export function createCompilerHost(options: CompilerHostOptions): CompilationHost {
  let thread: ScriptThread | null = null
  let idleRelease: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let nextId = 0
  const pending = new Map<
    number,
    {
      resolve(module: CompiledScriptSources): void
      reject(error: Error): void
    }
  >()
  const entries = new Set<Entry>()

  /** 只在有未完成请求时才创建线程；线程延迟创建不影响编译结果。 */
  function ensureThread(): ScriptThread {
    cancelIdleRelease()
    if (thread) return thread
    const created = options.createThread()
    thread = created
    created.onMessage((data) => {
      if (thread !== created) return
      const response = data as CompilerResponse
      const request = pending.get(response.requestId)
      if (!request) return
      pending.delete(response.requestId)
      if (response.type === 'compiled') request.resolve(response.module)
      else request.reject(Object.assign(new Error(response.error.message), response.error))
      releaseWhenIdle()
    })
    created.onError((error) => {
      if (thread === created) fail(error)
    })
    created.onMessageError(() => {
      if (thread === created) fail(new Error('无法读取脚本编译响应'))
    })
    return created
  }

  /** 队列清空后延迟回收线程；结果租约仍然有效。 */
  function releaseWhenIdle(): void {
    if (pending.size !== 0 || disposed) return
    cancelIdleRelease()
    idleRelease = setTimeout(() => {
      idleRelease = undefined
      if (pending.size === 0) releaseThread()
    }, COMPILER_IDLE_MS)
  }

  /** 取消排队回收与正式关闭共用同一个计时器。 */
  function cancelIdleRelease(): void {
    if (idleRelease === undefined) return
    clearTimeout(idleRelease)
    idleRelease = undefined
  }

  /** 先关闭线程，避免销毁后迟到的错误事件被当成线程故障。 */
  function releaseThread(): void {
    cancelIdleRelease()
    const current = thread
    thread = null
    current?.terminate()
  }

  /** 线程故障：拒绝未完成请求并丢弃缓存，下一次编译重新建线程。 */
  function fail(error: Error): void {
    releaseThread()
    for (const request of pending.values()) request.reject(error)
    pending.clear()
    entries.clear()
  }

  return {
    acquire(source, libraries = []) {
      if (disposed) throw new Error('脚本编译宿主已释放')
      let entry = [...entries].find(
        (candidate) =>
          candidate.source === source &&
          candidate.libraries.length === libraries.length &&
          candidate.libraries.every(
            (library, index) =>
              library.name === libraries[index]!.name &&
              library.source === libraries[index]!.source,
          ),
      )
      if (!entry) {
        const requestId = ++nextId
        const snapshot = libraries.map(({ name, source: text }) => ({ name, source: text }))
        const module = new Promise<CompiledScriptSources>((resolve, reject) => {
          pending.set(requestId, { resolve, reject })
          const request: CompilerRequest = { requestId, source, libraries: snapshot }
          try {
            ensureThread().postMessage(request)
          } catch (cause) {
            fail(cause instanceof Error ? cause : new Error(String(cause)))
          }
        })
        entry = { source, libraries: snapshot, module, references: 0 }
        entries.add(entry)
      }
      const owned = entry
      owned.references++
      let released = false
      return {
        module: owned.module,
        release: () => {
          if (released) return
          released = true
          if (--owned.references === 0) entries.delete(owned)
          if (entries.size === 0) releaseThread()
        },
      }
    },

    dispose() {
      if (disposed) return
      disposed = true
      for (const request of pending.values()) request.reject(new Error('脚本编译宿主已释放'))
      pending.clear()
      entries.clear()
      releaseThread()
    },
  }
}
