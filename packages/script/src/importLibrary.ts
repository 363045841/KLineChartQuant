/** 加载库入口：从默认环境按名称查找公开函数。 */
import { libraryEnvironment } from './libraryRuntime/impl/defaultEnvironment.js'

/** 获取当前环境已加载的库，使用方共用一个环境实例的 exports。 */
export const importLibrary = libraryEnvironment.importLibrary
