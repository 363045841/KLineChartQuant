/** 宿主用随包内置的脚本指标建立服务；自定义脚本宿主直接用 createScriptService。 */
import { builtinScriptSources } from '@363045841yyt/klinechart-script'
import type { ScriptService, ScriptServiceOptions } from '../types.js'
import { createScriptService } from './createScriptService.js'

/** 内置源码默认信任并随包发布，宿主只负责挂载与释放服务。 */
export function createBuiltinScriptService(
  options: ScriptServiceOptions = {},
): Promise<ScriptService> {
  return createScriptService([], { ...options, builtinSources: builtinScriptSources })
}
