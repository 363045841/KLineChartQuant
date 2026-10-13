/** 默认库环境：显式注册内置库，供 importLibrary 使用。 */
import { builtinLibraries } from '../../Library/builtinLibraries.js'
import { createLibraryEnvironment } from './createLibraryEnvironment.js'

/** 全局共用的 SDK；运行之间只复用函数表，不共享运行态。 */
export const libraryEnvironment = createLibraryEnvironment()

for (const [name, functions] of Object.entries(builtinLibraries)) {
  libraryEnvironment.defineLibrary(name, functions)
}
