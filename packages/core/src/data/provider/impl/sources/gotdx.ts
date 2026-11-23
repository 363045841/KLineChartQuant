/** GOTDX Provider 的实例装配；实时连接由 `data/stream` 的连接注册表统一建立。注册入口见 builtinProviders.ts。 */
import type { MarketDataProviderRegistry } from '../registry.js'
import { dataSourceRegistry } from '../sourceRegistry.js'
import { createHttpSource } from './createHttpSource.js'

/** Connector 通过 probe 上报 `liveBars`，与 `data/stream` 建立的 SSE 通道一一对应。 */
export function createGotdxMarketDataProvider(registry: MarketDataProviderRegistry) {
  return createHttpSource(dataSourceRegistry.gotdx, registry)
}
