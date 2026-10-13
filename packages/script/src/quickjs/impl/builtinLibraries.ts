/** 内置库显式 manifest，用户库复用相同源码加载和注册协议。 */
import type { QuickJSLibrary } from '../types.js'
import { TA_LIBRARY_SOURCE } from './prelude.js'

export const builtinLibraries: readonly QuickJSLibrary[] = Object.freeze([
  Object.freeze({ name: 'ta', source: TA_LIBRARY_SOURCE }),
])
