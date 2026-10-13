/**
 * 内置库清单：定义阶段产出函数表，绑定阶段据此装配到执行作用域。
 *
 * 与旧的 import 副作用注册不同，这里是一份显式清单：
 * 现在装配到 ctx，将来同一份清单装配到 QuickJS 全局。
 */
import type { LibraryModules } from '../contracts/library.js'
import { taLibrary } from './ta.js'

/** 内置库函数表，键名即脚本作用域中的库名；用 Partial 校验内置项与目录一致。 */
export const builtinLibraries = Object.freeze({ ta: taLibrary }) satisfies Partial<LibraryModules>
