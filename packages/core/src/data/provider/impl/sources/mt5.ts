/** MT5 Provider 的实例装配，包含实时 K 线流；注册入口见 builtinProviders.ts。 */
import type { MarketDataProviderRegistry } from '../registry.js'
import { dataSourceRegistry } from '../sourceRegistry.js'
import { createHttpSource } from './createHttpSource.js'

/** 实时订阅在创建时读取指定实例的生效地址。 */
export function createMt5MarketDataProvider(registry: MarketDataProviderRegistry) {
  return createHttpSource(dataSourceRegistry.mt5, registry, { liveBars: true })
}
