/** GOTDX Provider 的实例装配；注册入口见 builtinProviders.ts。 */
import type { MarketDataProviderRegistry } from '../registry.js'
import { dataSourceRegistry } from '../sourceRegistry.js'
import { createHttpSource } from './createHttpSource.js'

/**
 * 使用指定注册表实例创建 Provider。
 *
 * Connector 通过 probe 声明 `liveBars`；只有它返回 true 时前端才会订阅 SSE，
 * 这里不能再提供同名构造参数覆盖 probe 结果，否则会与前端消费的协议脱节。
 */
export function createGotdxMarketDataProvider(registry: MarketDataProviderRegistry) {
  return createHttpSource(dataSourceRegistry.gotdx, registry, { liveBars: true })
}
