/** Library 契约：库的公开函数、类型目录与环境内 SDK。 */

/** 库的公开函数表，保留各函数自己的参数与返回值类型。 */
export type LibraryExports = Record<string, (...args: never[]) => unknown>

/** 库的类型目录，由宿主按库名补充，不负责运行时加载。 */
export interface LibraryModules {}
