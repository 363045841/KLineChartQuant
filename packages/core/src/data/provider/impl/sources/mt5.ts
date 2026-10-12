/** MT5 Provider 的实例装配与默认注册，包含实时 K 线流。 */
import { type MarketDataProviderRegistry, marketDataProviderRegistry } from '../registry.js'
import { dataSourceRegistry } from '../sourceRegistry.js'
import { createHttpSource } from './createHttpSource.js'

/** 实时订阅在创建时读取指定实例的生效地址。 */
export function createMt5MarketDataProvider(registry: MarketDataProviderRegistry) {
  return createHttpSource(dataSourceRegistry.mt5, registry, { liveBars: true })
}
export const mt5MarketDataProvider = createMt5MarketDataProvider(marketDataProviderRegistry)
if (!marketDataProviderRegistry.get(mt5MarketDataProvider.source.id))
  marketDataProviderRegistry.register(mt5MarketDataProvider)
