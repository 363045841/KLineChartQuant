/** GOTDX Provider 的实例装配；实时连接由订阅池统一建立。注册入口见 builtinProviders.ts。 */
import type { MarketDataProviderRegistry } from '../registry.js'
import { dataSourceRegistry } from '../sourceRegistry.js'
import { createHttpSource } from './createHttpSource.js'

/** Connector 通过 probe 上报 `liveBars`，与订阅池的 SSE 通道一一对应。 */
export function createGotdxMarketDataProvider(registry: MarketDataProviderRegistry) {
  return createHttpSource(dataSourceRegistry.gotdx, registry)
}
