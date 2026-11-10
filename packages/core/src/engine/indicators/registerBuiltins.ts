/** 内置定义装配入口：静态目录随注册表同步可用，实现懒加载或一次性加载。 */
import { loadAllIndicatorDefinitions } from './pipeline/index.js'

/** 加载全部内置定义的实现；并发调用共享加载任务，失败可重试，注册按身份幂等。 */
export function loadBuiltinIndicators(): Promise<void> {
  return loadAllIndicatorDefinitions()
}
