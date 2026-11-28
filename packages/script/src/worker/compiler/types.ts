/** 编译线程协议与可释放的编译结果租约。 */
import type { CompiledScriptSources } from '../../execution/types.js'
import type { QuickJSLibrary } from '../../quickjs/types.js'
import type { ScriptWorkerError } from '../types.js'

export interface CompilerRequest {
  readonly requestId: number
  readonly source: string
  readonly libraries: readonly QuickJSLibrary[]
}
export type CompilerResponse = { readonly requestId: number } & (
  | { readonly type: 'compiled'; readonly module: CompiledScriptSources }
  | { readonly type: 'error'; readonly error: ScriptWorkerError }
)
export interface CompilationLease {
  readonly module: Promise<CompiledScriptSources>
  release(): void
}

/** 编译结果来源；一个线程池持有一个，负责线程生命周期与结果缓存。 */
export interface CompilationHost {
  acquire(source: string, libraries?: readonly QuickJSLibrary[]): CompilationLease
  dispose(): void
}
