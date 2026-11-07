/** 同一宿主的计算端口共用编译线程；缓存仅随活动源码租约存在，最后释放时终止线程。 */
import type { CompiledScriptSources } from '../../../execution/types.js'
import type { QuickJSLibrary } from '../../../quickjs/types.js'
import type { CompilationLease, CompilerRequest, CompilerResponse } from '../types.js'

interface Entry {
  readonly source: string
  readonly libraries: readonly QuickJSLibrary[]
  readonly module: Promise<CompiledScriptSources>
  references: number
}

class CompilerHost {
  private readonly worker = new Worker(new URL('./compiler.worker.js', import.meta.url), {
    type: 'module',
  })
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

  /** 线程故障只影响当前编译租约；已安装的执行模块仍可继续计算。 */
  constructor() {
    this.worker.addEventListener('message', (event: MessageEvent<CompilerResponse>) => {
      const response = event.data
      const pending = this.pending.get(response.requestId)
      if (!pending) return
      this.pending.delete(response.requestId)
      if (response.type === 'compiled') pending.resolve(response.module)
      else pending.reject(Object.assign(new Error(response.error.message), response.error))
    })
    this.worker.addEventListener('error', (event: ErrorEvent) =>
      this.stop(new Error(event.message)),
    )
    this.worker.addEventListener('messageerror', () => this.stop(new Error('无法读取脚本编译响应')))
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
          this.worker.postMessage(request)
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
    this.worker.terminate()
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
