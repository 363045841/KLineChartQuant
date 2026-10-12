/** 同花顺 THS 日线 Provider 的实例装配与默认注册。 */
import { type MarketDataProviderRegistry, marketDataProviderRegistry } from '../registry.js'
import { dataSourceRegistry } from '../sourceRegistry.js'
import { createHttpSource } from './createHttpSource.js'

/** 周期能力由 Connector 的标准协议声明。 */
export function createThsMarketDataProvider(registry: MarketDataProviderRegistry) {
  return createHttpSource(dataSourceRegistry.ths, registry)
}
export const thsMarketDataProvider = createThsMarketDataProvider(marketDataProviderRegistry)
if (!marketDataProviderRegistry.get(thsMarketDataProvider.source.id))
  marketDataProviderRegistry.register(thsMarketDataProvider)
