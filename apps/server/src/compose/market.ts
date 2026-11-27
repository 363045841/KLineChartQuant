/**
 * 行情组合：注册全部内置数据源，再按命令行给出的清单启用。
 */
import {
  createMarketDataHost,
  installBuiltinProviders,
  type MarketDataContext,
  type EventStreamFactory,
} from '@363045841yyt/klinechart-core/node'
import type { ServerConfig } from '../config.js'

/**
 * 装配行情宿主。
 *
 * @param config - 启用的数据源清单
 * @param fetchImpl - 宿主 fetch
 * @param openEventStream - 宿主事件流
 * @returns 可用的行情宿主
 */
export function composeMarket(
  config: ServerConfig,
  fetchImpl: typeof fetch,
  openEventStream: EventStreamFactory,
): MarketDataContext {
  const market = createMarketDataHost()
  installBuiltinProviders(market.registry, { fetchImpl, openEventStream })
  const enabled = new Set(config.sources)
  for (const provider of market.registry.getAll()) {
    market.registry.setConfig(provider.source.id, { enabled: enabled.has(provider.source.id) })
  }
  return market
}
