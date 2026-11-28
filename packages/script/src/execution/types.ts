/** 脚本执行的边界：计算线程只接收可执行源码、库与声明信息。 */
import type { QuickJSLibrary } from '../quickjs/types.js'

export interface CompiledScriptSources {
  readonly source: string
  readonly libraries: readonly QuickJSLibrary[]
  /** 源码是否调用 alert()；警报脚本缺这个调用直接拒绝。 */
  readonly hasAlertCall: boolean
}
