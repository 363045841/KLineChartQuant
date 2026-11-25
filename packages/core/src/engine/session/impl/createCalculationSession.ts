/**
 * 计算会话：持有行情、定义解析与计算中枢，图表与警报只作为消费者接入。
 *
 * 会话是唯一所有者；消费者销毁时只释放自己的 client 与 feed。
 */
import { createCalculationHub } from '@/engine/calculation/index.js'
import { createCalculationMarket } from '@/engine/calculation/market/index.js'
import {
  applyMarketSessions,
} from '@/foundation/config/marketSession/applyMarketSessions.js'
import { MarketSessionRegistry } from '@/foundation/config/marketSession/marketSessionRegistry.js'
import { createCalculationDefinitions } from './createCalculationDefinitions.js'
import type { CalculationSession, CalculationSessionOptions } from '../types.js'

/**
 * 创建一个计算会话。
 *
 * @param options 行情来源、市场时段覆盖与初始定义
 * @returns 计算中枢、会话级市场时段与释放
 */
export function createCalculationSession(
  options: CalculationSessionOptions,
): CalculationSession {
  const marketSessions = new MarketSessionRegistry()
  const applySessions = () =>
    applyMarketSessions(
      marketSessions,
      options.registry.getAll().map((provider) => provider.source),
      options.marketSessions,
    )
  applySessions()
  const unsubscribeRegistry = options.registry.state.subscribe(applySessions)

  const market = createCalculationMarket({ registry: options.registry, marketSessions })
  const definitions = createCalculationDefinitions()
  const hub = createCalculationHub({
    resolveDefinition: (definitionId) => definitions.resolve(definitionId),
    marketData: () => market,
  })
  const unsubscribeDefinitions = definitions.subscribe((changed) =>
    hub.invalidateDefinitions(changed),
  )

  return {
    hub,
    marketSessions,
    dispose() {
      unsubscribeDefinitions()
      definitions.dispose()
      hub.dispose()
      market.dispose()
      unsubscribeRegistry()
    },
  }
}
