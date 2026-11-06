/** 编译与执行的边界：计算线程只接收可执行源码和库。 */
import type { QuickJSLibrary } from '../quickjs/types.js'

export interface CompiledScriptSources {
  readonly source: string
  readonly libraries: readonly QuickJSLibrary[]
}
