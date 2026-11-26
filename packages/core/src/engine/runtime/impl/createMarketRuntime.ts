/**
 * 共享运行时工厂：组合行情、定义与计算，不创建任何消费者。
 */
import { applyMarketSessions } from '@/foundation/config/marketSession/applyMarketSessions.js'
import { MarketSessionRegistry } from '@/foundation/config/marketSession/marketSessionRegistry.js'
import { createCalculationHub } from '../../calculation/index.js'
import { createCalculationMarket } from '../../calculation/market/index.js'
import { toCalculationDefinition } from '../../indicators/instances/assembly/toCalculationDefinition.js'
import type { MarketRuntime, MarketRuntimeOptions } from '../types.js'

/** 创建共享运行时；所有资源由本对象持有并释放。 */
export function createMarketRuntime(options: MarketRuntimeOptions): MarketRuntime {
  const marketSessions = new MarketSessionRegistry()
  const applySessions = (): void =>
    applyMarketSessions(
      marketSessions,
      options.market.registry.getAll().map((provider) => provider.source),
      options.marketSessions,
    )
  applySessions()
  const unsubscribeSessions = options.market.registry.state.subscribe(applySessions)

  const calculationMarket = createCalculationMarket({
    registry: options.market.registry,
    marketSessions,
  })
  const calculation = createCalculationHub({
    resolveDefinition: (definitionId) => {
      const metadata = options.definitions.getDefinition(definitionId)
      return metadata === undefined ? undefined : toCalculationDefinition(metadata)
    },
    marketData: () => calculationMarket,
  })

  const unsubscribeDefinitions = options.definitions.commits.subscribe(() => {
    const commit = options.definitions.commits.peek()
    if (!commit) return
    const changed = [...commit.updated, ...commit.removed].map((definition) => definition.name)
    if (changed.length > 0) calculation.invalidateDefinitions(changed)
  })

  let disposed = false
  return {
    market: options.market,
    definitions: options.definitions,
    calculation,
    marketSessions,
    dispose() {
      if (disposed) return
      disposed = true
      unsubscribeDefinitions()
      unsubscribeSessions()
      calculation.dispose()
      calculationMarket.dispose()
    },
  }
}
