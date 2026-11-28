/** TradingView Provider 的实例装配；注册入口见 builtinProviders.ts。 */
import type { MarketDataProviderRegistry } from '../../registry.js'
import { dataSourceRegistry } from '../sourceRegistry.js'
import { createHttpSource, type HttpSourceOptions } from './createHttpSource.js'

/** TradingView 的成交量口径无法从后端确认，显式声明为未知而不是猜测单位。 */
export function createTradingviewMarketDataProvider(
  registry: MarketDataProviderRegistry,
  options: HttpSourceOptions,
) {
  return createHttpSource(dataSourceRegistry.tradingview, registry, {
    ...options,
    resolveVolumeUnit: () => undefined,
  })
}
