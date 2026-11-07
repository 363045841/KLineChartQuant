/** 编译产物随源码租约保留，物理编译线程只在编译期间及短暂空闲窗口存在。 */
import type { CompiledScriptSources } from '../../../execution/types.js'
import type { QuickJSLibrary } from '../../../quickjs/types.js'
import type { CompilationLease, CompilerRequest, CompilerResponse } from '../types.js'

/** 合并启动和连续保存产生的编译请求；空闲后不让 TypeScript VM 随指标常驻。 */
const COMPILER_IDLE_MS = 1000

interface Entry {
  readonly source: string
  readonly libraries: readonly QuickJSLibrary[]
  readonly module: Promise<CompiledScriptSources>
  references: number
}

class CompilerHost {
  private worker: Worker | undefined
  private idleRelease: ReturnType<typeof setTimeout> | undefined
  private readonly pending = new Map<
    number,
    {
      resolve(module: CompiledScriptSources): void
      reject(error: Error): void
    }
  >()
  private readonly entries = new Set<Entry>()
  private nextId = 0
  private failure: Error | undefined

  /** 只有缓存未命中才需要物理线程；旧线程延迟到达的事件不能影响后来创建的线程。 */
  private getWorker(): Worker {
    this.cancelIdleRelease()
    if (this.worker) return this.worker
    const worker = new Worker(new URL('./compiler.worker.js', import.meta.url), { type: 'module' })
    this.worker = worker
    worker.addEventListener('message', (event: MessageEvent<CompilerResponse>) => {
      if (this.worker !== worker) return
      const response = event.data
      const pending = this.pending.get(response.requestId)
      if (!pending) return
      this.pending.delete(response.requestId)
      if (response.type === 'compiled') pending.resolve(response.module)
      else pending.reject(Object.assign(new Error(response.error.message), response.error))
      this.releaseWhenIdle()
    })
    worker.addEventListener('error', (event: ErrorEvent) => {
      if (this.worker === worker) this.stop(new Error(event.message))
    })
    worker.addEventListener('messageerror', () => {
      if (this.worker === worker) this.stop(new Error('无法读取脚本编译响应'))
    })
    return worker
  }

  /** 编译请求在途时不回收线程；产物 Promise 与源码租约不依赖线程继续存活。 */
  private releaseWhenIdle(): void {
    if (this.pending.size !== 0 || this.failure) return
    this.cancelIdleRelease()
    this.idleRelease = setTimeout(() => {
      this.idleRelease = undefined
      if (this.pending.size === 0) this.releaseWorker()
    }, COMPILER_IDLE_MS)
  }

  /** 新编译、显式销毁和故障共用同一处计时器清理。 */
  private cancelIdleRelease(): void {
    if (this.idleRelease === undefined) return
    clearTimeout(this.idleRelease)
    this.idleRelease = undefined
  }

  /** 先解除线程身份再终止，避免其退出事件被误判为新线程故障。 */
  private releaseWorker(): void {
    this.cancelIdleRelease()
    const worker = this.worker
    this.worker = undefined
    worker?.terminate()
  }

  /** 同源码和依赖只编译一次；克隆库字段隔离调用方之后的修改。 */
  acquire(source: string, libraries: readonly QuickJSLibrary[]): CompilationLease {
    let entry = [...this.entries].find(
      (candidate) =>
        candidate.source === source &&
        candidate.libraries.length === libraries.length &&
        candidate.libraries.every(
          (library, index) =>
            library.name === libraries[index]!.name && library.source === libraries[index]!.source,
        ),
    )
    if (!entry) {
      const requestId = ++this.nextId
      const snapshot = libraries.map(({ name, source }) => ({ name, source }))
      const module = new Promise<CompiledScriptSources>((resolve, reject) => {
        if (this.failure) {
          reject(this.failure)
          return
        }
        this.pending.set(requestId, { resolve, reject })
        const request: CompilerRequest = { requestId, source, libraries: snapshot }
        try {
          this.getWorker().postMessage(request)
        } catch (cause) {
          this.stop(cause instanceof Error ? cause : new Error(String(cause)))
        }
      })
      entry = { source, libraries: snapshot, module, references: 0 }
      this.entries.add(entry)
    }
    const owned = entry
    owned.references++
    let released = false
    return {
      module: owned.module,
      release: () => {
        if (released) return
        released = true
        if (--owned.references === 0) this.entries.delete(owned)
        if (this.entries.size === 0) this.stop(new Error('脚本编译器已释放'))
      },
    }
  }

  /** 拒绝未完成编译并释放 TypeScript 所在物理线程；允许后续宿主重新创建。 */
  private stop(error: Error): void {
    if (this.failure) return
    this.failure = error
    this.releaseWorker()
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
    if (shared === this) shared = undefined
  }
}

let shared: CompilerHost | undefined

/** 源码租约由计算端口的脚本句柄持有，不建立全局历史源码缓存。 */
export function acquireCompilation(
  source: string,
  libraries: readonly QuickJSLibrary[] = [],
): CompilationLease {
  shared ??= new CompilerHost()
  return shared.acquire(source, libraries)
}
