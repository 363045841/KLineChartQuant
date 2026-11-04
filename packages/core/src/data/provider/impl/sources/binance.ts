/** Binance Provider 的实例装配，K 线与成交共享连接配置；实时连接由订阅池统一建立。 */
import type { MarketDataProviderRegistry } from '../registry.js'
import { dataSourceRegistry } from '../sourceRegistry.js'
import { createHttpSource } from './createHttpSource.js'

/** 通过同一实例装配 HTTP 与成交流；实时 K 线走共享订阅池。 */
export function createBinanceMarketDataProvider(registry: MarketDataProviderRegistry) {
  return createHttpSource(dataSourceRegistry.binance, registry, { trades: true })
}
