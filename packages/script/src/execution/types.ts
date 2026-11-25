/** 脚本执行的边界：计算线程只接收可执行源码、库与编译期推断的依赖。 */
import type { ComputeDependency } from '@363045841yyt/klinechart-plot-contracts'
import type { QuickJSLibrary } from '../quickjs/types.js'

export interface CompiledScriptSources {
  readonly source: string
  readonly libraries: readonly QuickJSLibrary[]
  /** 由源码推断的计算依赖；运行时只按它选择重算区间，不再猜测。 */
  readonly dependency: ComputeDependency
  /** 结构变化时是否需要完全重放。 */
  readonly replayOnUpdate: boolean
  /** 源码是否调用 alert()；警报脚本缺这个调用直接拒绝。 */
  readonly hasAlertCall: boolean
}
