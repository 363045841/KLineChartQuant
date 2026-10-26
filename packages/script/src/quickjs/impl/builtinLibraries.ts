/** 内置库显式 manifest：执行用编译产物，编辑器展示带类型的原始源码。 */

import { TA_LIBRARY_SOURCE, TA_LIBRARY_TYPES_SOURCE } from '../generated/runtime.js'
import type { QuickJSLibrary } from '../types.js'

/** 内置库比用户库多一份编辑器只读展示源码；VM 只消费 name/source。 */
export interface BuiltinLibrary extends QuickJSLibrary {
  readonly typeSource: string
}

export const builtinLibraries: readonly BuiltinLibrary[] = Object.freeze([
  Object.freeze({ name: 'ta', source: TA_LIBRARY_SOURCE, typeSource: TA_LIBRARY_TYPES_SOURCE }),
])
