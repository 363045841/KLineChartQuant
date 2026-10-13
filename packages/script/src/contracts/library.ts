/** Library 契约：库的公开函数、类型目录与环境内 SDK。 */

/** 库的公开函数表，保留各函数自己的参数与返回值类型。 */
export type LibraryExports = Record<string, (...args: never[]) => unknown>

/** 库的类型目录，由宿主按库名补充，不负责运行时加载。 */
export interface LibraryModules {}

/** 每个执行环境独立持有的库 SDK，不向用户暴露注册表或实例工厂。 */
export interface LibraryEnvironment {
  /** 声明公开函数，返回函数表供宿主验证类型。 */
  defineLibrary<E extends LibraryExports>(name: string, functions: E): E
  /** 按库名导入，已知库保留完整的参数和返回值类型。 */
  importLibrary<N extends keyof LibraryModules>(name: N): LibraryModules[N]
  /** 查找类型目录之外的库；不存在时抛出错误。 */
  importLibrary(name: string): LibraryExports
  /** 汇总当前环境全部已注册库，键名与类型目录一致，供绑定到执行作用域。 */
  libraries(): LibraryModules
}
