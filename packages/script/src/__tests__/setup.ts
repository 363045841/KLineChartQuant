/** 全部用例共用的 QuickJS 初始化：WASM 只加载一次，后端用例在 setup 之后才执行。 */
import { beforeAll } from 'vitest'
import { preloadQuickJS } from '../quickjs/impl/runQuickJSScript.js'

beforeAll(preloadQuickJS)
