/** 创建环境独立的库表，按名称查找并绑定库；本模块不创建虚拟机。 */
import type { LibraryEnvironment, LibraryExports, LibraryModules } from '../../contracts/library.js'

/** 创建一组库 SDK；宿主需在所属环境内加载源码并使用该 SDK 声明库。 */
export function createLibraryEnvironment(): LibraryEnvironment {
  const registry = new Map<string, LibraryExports>()

  /** 登记当前环境中的公开函数，拒绝覆盖同名库。 */
  function defineLibrary<E extends LibraryExports>(name: string, functions: E): E {
    if (registry.has(name)) throw new Error(`Library '${name}' 已声明`)
    registry.set(name, functions)
    return functions
  }

  /** 从当前环境的库表按名称查找，已知库由类型目录描述公开接口。 */
  function importLibrary<N extends keyof LibraryModules>(name: N): LibraryModules[N]
  function importLibrary(name: string): LibraryExports
  function importLibrary(name: string): LibraryExports {
    const functions = registry.get(name)
    if (!functions) throw new Error(`Library '${name}' 未加载`)
    return functions
  }

  /** 汇总当前环境全部库，供绑定到执行作用域；键名即目录中的库名。 */
  function libraries(): LibraryModules {
    // 注册表按运行时名称存放，目录由声明合并描述；此处是动态表与目录类型唯一对齐点。
    return Object.fromEntries(registry) as LibraryModules & Record<string, LibraryExports>
  }

  return { defineLibrary, importLibrary, libraries }
}
