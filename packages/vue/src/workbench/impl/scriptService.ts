/**
 * 页面级脚本服务：注册表与用户脚本工作区都是页面级状态，服务必须与它们同生命周期。
 *
 * 工作区里每个标签都会挂载一个工作台，共享同一次初始化，避免每个标签各建一套
 * Worker 并向全局注册表重复注册内置脚本。
 */
import type { ScriptService } from '@363045841yyt/klinechart-script-chart'

let shared: Promise<ScriptService> | undefined

/**
 * 取得本页共用的脚本服务；并发调用共享同一次初始化。
 *
 * 初始化失败会清空缓存，下一次调用可以重试。
 *
 * @returns 已恢复工作区的脚本服务
 */
export function sharedScriptService(): Promise<ScriptService> {
  shared ??= import('@363045841yyt/klinechart-script-chart')
    .then(({ createBuiltinScriptService }) => createBuiltinScriptService())
    .catch((error: unknown) => {
      shared = undefined
      throw error
    })
  return shared
}
