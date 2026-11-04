/** MT5 Provider 的实例装配；实时连接由订阅池统一建立。注册入口见 builtinProviders.ts。 */
import type { MarketDataProviderRegistry } from '../registry.js'
import { dataSourceRegistry } from '../sourceRegistry.js'
import { createHttpSource } from './createHttpSource.js'

/** 按注册表中的生效地址装配 MT5 HTTP Provider。 */
export function createMt5MarketDataProvider(registry: MarketDataProviderRegistry) {
  return createHttpSource(dataSourceRegistry.mt5, registry)
}
