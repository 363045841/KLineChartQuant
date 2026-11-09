/** 内置定义装配入口：静态目录随注册表同步可用，实现懒加载或一次性加载。 */
import {
  loadAllIndicatorDefinitions,
  loadIndicatorDefinitions,
  readIndicatorDescriptors,
} from './pipeline/index.js'
import { IndicatorKind } from './indicatorMetadata.js'

/** 加载全部内置定义的实现；并发调用共享加载任务，失败可重试，注册按身份幂等。 */
export function loadBuiltinIndicators(): Promise<void> {
  return loadAllIndicatorDefinitions()
}

/**
 * 加载图表视图自身需要的系统定义；所有用户指标由脚本服务提供。
 */
export function loadSystemIndicators(): Promise<void> {
  return loadIndicatorDefinitions(
    readIndicatorDescriptors()
      .filter((descriptor) => descriptor.kind === IndicatorKind.System)
      .map((descriptor) => descriptor.name),
  )
}
