/** MT5 Provider 的实例装配；实时连接由 Provider 声明，注册入口见 builtinProviders.ts。 */
import type { MarketDataProviderRegistry } from '../../registry.js'
import { dataSourceRegistry } from '../sourceRegistry.js'
import { createHttpSource, type HttpSourceOptions } from './createHttpSource.js'

/** 用注册表里的生效地址装配 MT5 HTTP Provider。 */
export function createMt5MarketDataProvider(
  registry: MarketDataProviderRegistry,
  options: HttpSourceOptions,
) {
  return createHttpSource(dataSourceRegistry.mt5, registry, options)
}
