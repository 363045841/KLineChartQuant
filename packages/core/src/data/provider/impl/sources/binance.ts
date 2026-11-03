/** Binance Provider 的实例装配，K 线与成交共享连接配置；注册入口见 builtinProviders.ts。 */
import type { MarketDataProviderRegistry } from '../registry.js'
import { dataSourceRegistry } from '../sourceRegistry.js'
import { createHttpSource } from './createHttpSource.js'

/** 通过同一实例装配 HTTP、实时 K 线与成交流。 */
export function createBinanceMarketDataProvider(registry: MarketDataProviderRegistry) {
  return createHttpSource(dataSourceRegistry.binance, registry, { liveBars: true, trades: true })
}
