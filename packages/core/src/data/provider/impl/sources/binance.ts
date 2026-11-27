/** Binance Provider 的实例装配；K 线与成交流共用同一份传输，实时连接由 Provider 声明。 */
import type { MarketDataProviderRegistry } from '../../registry.js'
import { dataSourceRegistry } from '../sourceRegistry.js'
import { createHttpSource, type HttpSourceOptions } from './createHttpSource.js'

/** 同一实例装配 HTTP 成交流与实时 K 线，共用宿主注入的 fetch 与事件流。 */
export function createBinanceMarketDataProvider(
  registry: MarketDataProviderRegistry,
  options: HttpSourceOptions,
) {
  return createHttpSource(dataSourceRegistry.binance, registry, { ...options, trades: true })
}
