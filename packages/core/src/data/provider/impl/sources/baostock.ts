/** BaoStock Provider 的实例装配；注册入口见 builtinProviders.ts。 */
import type { MarketDataProviderRegistry } from '../../registry.js'
import { dataSourceRegistry } from '../sourceRegistry.js'
import { createHttpSource, type HttpSourceOptions } from './createHttpSource.js'

/** 使用指定注册表装配内置 Provider。 */
export function createBaostockMarketDataProvider(
  registry: MarketDataProviderRegistry,
  options: HttpSourceOptions,
) {
  return createHttpSource(dataSourceRegistry.baostock, registry, options)
}
