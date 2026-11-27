/**
 * 页面级脚本服务：每个运行时注册表一份，工作台与 Agent 共用。
 *
 * 服务按注册表隔离；并发调用共享同一次初始化，不创建第二套 Worker。
 */
import type { DefinitionRegistry } from '@363045841yyt/klinechart-core'
import type { ScriptService } from '@363045841yyt/klinechart-script-chart'

const services = new WeakMap<DefinitionRegistry, Promise<ScriptService>>()

/**
 * 取得指定注册表的脚本服务；首次调用才加载脚本包并恢复工作区。
 *
 * @param definitions 运行时定义注册表
 * @param isDefinitionReferenced 警报引用检查
 * @returns 已恢复工作区的脚本服务
 */
export function sharedScriptService(
  definitions: DefinitionRegistry,
  isDefinitionReferenced: (definitionId: string) => boolean | Promise<boolean>,
): Promise<ScriptService> {
  let shared = services.get(definitions)
  shared ??= import('./createBrowserScriptService.js')
    .then(({ createBrowserScriptService }) =>
      createBrowserScriptService({ definitions, isDefinitionReferenced }),
    )
    .catch((error: unknown) => {
      services.delete(definitions)
      throw error
    })
  services.set(definitions, shared)
  return shared
}
