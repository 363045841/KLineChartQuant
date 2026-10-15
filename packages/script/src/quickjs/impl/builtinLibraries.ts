/** 内置库显式 manifest，用户库复用相同源码加载和注册协议。 */

import { TA_LIBRARY_SOURCE } from '../generated/runtime.js'
import type { QuickJSLibrary } from '../types.js'

export const builtinLibraries: readonly QuickJSLibrary[] = Object.freeze([
  Object.freeze({ name: 'ta', source: TA_LIBRARY_SOURCE }),
])
