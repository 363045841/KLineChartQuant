/**
 * 页面级脚本服务：注册表与用户脚本工作区都是页面级状态，服务必须与页面同生命周期。
 *
 * 工作台与 Agent 共用这一个入口；并发调用共享同一次初始化，避免两套 Worker
 * 和两份全局指标注册。
 */
import type { ScriptService } from '@363045841yyt/klinechart-script-chart'
import { hasAlertScriptReference } from '@363045841yyt/klinechart-core/controllers'

let shared: Promise<ScriptService> | undefined

/**
 * 取得本页共用的脚本服务；首次调用才加载脚本包并恢复工作区。
 *
 * @returns 已恢复工作区的脚本服务
 */
export function sharedScriptService(): Promise<ScriptService> {
  shared ??= import('@363045841yyt/klinechart-script-chart')
    .then(({ createBuiltinScriptService }) =>
      createBuiltinScriptService({ isDefinitionReferenced: hasAlertScriptReference }),
    )
    .catch((error: unknown) => {
      shared = undefined
      throw error
    })
  return shared
}
