/** 内置定义唯一装配入口；所有身份共用清单、加载任务和注册目录。 */
import { loadBuiltinDefinitionClasses } from './generated/builtinIndicators.js'
import { registerIndicatorDefinition } from './indicatorDefinitionRegistry.js'

let loading: ReturnType<typeof loadBuiltinDefinitionClasses> | undefined

/** 并发调用共享模块加载；失败可重试，目录注册按元数据身份幂等。 */
export async function loadBuiltinIndicators(): Promise<void> {
  loading ??= loadBuiltinDefinitionClasses().catch((error: unknown) => {
    loading = undefined
    throw error
  })
  for (const definition of await loading) registerIndicatorDefinition(definition)
}
