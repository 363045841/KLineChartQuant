/** GOTDX Provider 的实例装配；实时连接由 Provider 声明，注册顺序见 builtinProviders.ts。 */
import type { MarketDataProviderRegistry } from '../../registry.js'
import { dataSourceRegistry } from '../sourceRegistry.js'
import { createHttpSource, type HttpSourceOptions } from './createHttpSource.js'

/** Connector 通过 probe 上报 `liveBars`，与 `data/stream` 的 SSE 通道一一对应。 */
export function createGotdxMarketDataProvider(
  registry: MarketDataProviderRegistry,
  options: HttpSourceOptions,
) {
  return createHttpSource(dataSourceRegistry.gotdx, registry, options)
}
