/** 宿主可创建互相隔离的内置行情管理实例。 */
import { MarketDataContext } from '../../../management/impl/context.js'
import type { MarketDataConfiguration } from '../../../management/types.js'
import { installBuiltinProviders } from './builtinProviders.js'
import { createMockDataSource } from './mock.js'

/** 每个实例创建独立 Provider 和传输闭包，不复制默认实例的运行状态。 */
export function createBuiltinMarketDataContext(
  configuration?: MarketDataConfiguration,
): MarketDataContext {
  const context = new MarketDataContext()
  installBuiltinProviders(context.registry)
  context.registerDataSource(createMockDataSource())
  if (configuration) context.restore(configuration)
  return context
}
