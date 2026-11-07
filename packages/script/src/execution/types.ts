/** 编译与执行的边界：计算线程只接收可执行源码、库与编译期推断的依赖。 */
import type { ComputeDependency } from '@363045841yyt/klinechart-plot-contracts'
import type { QuickJSLibrary } from '../quickjs/types.js'

export interface CompiledScriptSources {
  readonly source: string
  readonly libraries: readonly QuickJSLibrary[]
  /** 编译期推断的计算依赖；运行时只读，不再自行猜测。 */
  readonly dependency: ComputeDependency
  /** 不受运行时检查点管理的可变状态要求全量重放。 */
  readonly replayOnUpdate: boolean
}
