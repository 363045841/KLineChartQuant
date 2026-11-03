/** TradingView Provider 的实例装配；注册入口见 builtinProviders.ts。 */
import type { MarketDataProviderRegistry } from '../registry.js'
import { dataSourceRegistry } from '../sourceRegistry.js'
import { createHttpSource } from './createHttpSource.js'

/** TradingView 返回股数，不按 CN 会话兜底为手。 */
export function createTradingviewMarketDataProvider(registry: MarketDataProviderRegistry) {
  return createHttpSource(dataSourceRegistry.tradingview, registry, {
    resolveVolumeUnit: () => undefined,
  })
}
