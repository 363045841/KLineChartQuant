/** 内置定义装配入口：静态目录随注册表同步可用，实现按需或一次性加载。 */
import {
  getIndicatorDescriptors,
  loadAllIndicatorDefinitions,
  loadIndicatorDefinitions,
} from './indicatorDefinitionRegistry.js'
import { IndicatorKind } from './indicatorMetadata.js'

/** 加载全部内置定义的实现；并发调用共享加载任务，失败可重试，注册按身份幂等。 */
export function loadBuiltinIndicators(): Promise<void> {
  return loadAllIndicatorDefinitions()
}

/** 加载图表视图自身需要的系统定义（K 线标注、最新价、分时主线等）。 */
export function loadSystemIndicators(): Promise<void> {
  return loadIndicatorDefinitions(
    getIndicatorDescriptors()
      .filter((descriptor) => descriptor.kind === IndicatorKind.System)
      .map((descriptor) => descriptor.name),
  )
}
