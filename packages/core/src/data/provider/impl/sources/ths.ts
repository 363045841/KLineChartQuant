/** 同花顺 THS 数据 Provider 的实例装配；注册入口见 builtinProviders.ts。 */
import type { MarketDataProviderRegistry } from '../../registry.js'
import { dataSourceRegistry } from '../sourceRegistry.js'
import { createHttpSource, type HttpSourceOptions } from './createHttpSource.js'

/** 复用 Connector 的标准协议，不额外定义字段。 */
export function createThsMarketDataProvider(
  registry: MarketDataProviderRegistry,
  options: HttpSourceOptions,
) {
  return createHttpSource(dataSourceRegistry.ths, registry, options)
}
