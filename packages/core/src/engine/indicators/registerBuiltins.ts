/** 内置定义装配入口：实现懒加载或一次性加载。 */
import type { DefinitionRegistry } from './registry/index.js'

/** 加载全部内置定义的实现；并发调用共享加载任务，失败可重试，注册按身份幂等。 */
export function loadBuiltinIndicators(registry: DefinitionRegistry): Promise<void> {
  return registry.loadAll()
}
