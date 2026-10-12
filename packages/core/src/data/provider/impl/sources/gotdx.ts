/** GOTDX Provider 的实例装配与默认注册。 */
import { type MarketDataProviderRegistry, marketDataProviderRegistry } from '../registry.js'
import { dataSourceRegistry } from '../sourceRegistry.js'
import { createHttpSource } from './createHttpSource.js'

/** 使用指定管理实例的连接配置。 */
export function createGotdxMarketDataProvider(registry: MarketDataProviderRegistry) {
  return createHttpSource(dataSourceRegistry.gotdx, registry)
}
export const gotdxMarketDataProvider = createGotdxMarketDataProvider(marketDataProviderRegistry)
if (!marketDataProviderRegistry.get(gotdxMarketDataProvider.source.id))
  marketDataProviderRegistry.register(gotdxMarketDataProvider)
