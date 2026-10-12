/** TradingView Provider 的实例装配与默认注册。 */
import { type MarketDataProviderRegistry, marketDataProviderRegistry } from '../registry.js'
import { dataSourceRegistry } from '../sourceRegistry.js'
import { createHttpSource } from './createHttpSource.js'

/** TradingView 返回股数，不按 CN 会话兜底为手。 */
export function createTradingviewMarketDataProvider(registry: MarketDataProviderRegistry) {
  return createHttpSource(dataSourceRegistry.tradingview, registry, {
    resolveVolumeUnit: () => undefined,
  })
}
export const tradingviewMarketDataProvider = createTradingviewMarketDataProvider(
  marketDataProviderRegistry,
)
if (!marketDataProviderRegistry.get(tradingviewMarketDataProvider.source.id))
  marketDataProviderRegistry.register(tradingviewMarketDataProvider)
