/** BaoStock Provider 的实例装配与默认注册。 */
import { type MarketDataProviderRegistry, marketDataProviderRegistry } from '../registry.js'
import { dataSourceRegistry } from '../sourceRegistry.js'
import { createHttpSource } from './createHttpSource.js'

/** 使用指定管理实例的连接配置。 */
export function createBaostockMarketDataProvider(registry: MarketDataProviderRegistry) {
  return createHttpSource(dataSourceRegistry.baostock, registry)
}
export const baostockMarketDataProvider = createBaostockMarketDataProvider(
  marketDataProviderRegistry,
)
if (!marketDataProviderRegistry.get(baostockMarketDataProvider.source.id))
  marketDataProviderRegistry.register(baostockMarketDataProvider)
