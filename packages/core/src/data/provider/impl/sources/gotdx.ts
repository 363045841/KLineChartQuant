/** GOTDX Provider 的实例装配与默认注册。 */
import { type MarketDataProviderRegistry, marketDataProviderRegistry } from '../registry.js'
import { dataSourceRegistry } from '../sourceRegistry.js'
import { createHttpSource } from './createHttpSource.js'

/**
 * 使用指定管理实例的连接配置。
 *
 * Connector 通过 probe 声明 `liveBars`；只有声明为 true 时前端才会订阅 SSE，
 * 因此这里必须提供同一流的工厂，否则 probe 一升级就会与前端能力协商脱节。
 */
export function createGotdxMarketDataProvider(registry: MarketDataProviderRegistry) {
  return createHttpSource(dataSourceRegistry.gotdx, registry, { liveBars: true })
}
export const gotdxMarketDataProvider = createGotdxMarketDataProvider(marketDataProviderRegistry)
if (!marketDataProviderRegistry.get(gotdxMarketDataProvider.source.id))
  marketDataProviderRegistry.register(gotdxMarketDataProvider)
