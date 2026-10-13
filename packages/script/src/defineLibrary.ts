/** defineLibrary：用户直接声明库内函数，不参与指标注册。 */
import { libraryEnvironment } from './libraryRuntime/impl/defaultEnvironment.js'

/** 按名称声明库及公开函数。 */
export const defineLibrary = libraryEnvironment.defineLibrary
