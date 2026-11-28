/**
 * 共享运行时工厂：组合行情、定义、计算与取数服务，不创建任何消费者。
 */

import { seriesSelectionKey } from '@/data/buffer/seriesSelection.js'
import { DATA_CHANGE_KINDS } from '@/data/buffer/types.js'
import { createMarketDataService } from '@/data/service/index.js'
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

  const data = createMarketDataService({
    registry: options.market.registry,
    stream: options.market.stream,
    marketSessions,
    clock: options.clock,
    health: options.market.health,
  })
  const calculation = createCalculationHub({
    resolveDefinition: (definitionId) => {
      const metadata = options.definitions.getDefinition(definitionId)
      return metadata === undefined ? undefined : toCalculationDefinition(metadata)
    },
    marketData: createCalculationMarket(data, marketSessions),
  })

  const unsubscribeBars = data.subscribeBars((selection, update) => {
    if (!update) {
      calculation.removeFeed(seriesSelectionKey(selection))
      return
    }
    const { change, instrument, revision, liveBarTime, closedBarTime } = update
    if (!change.data.length) return
    calculation.updateFeed({
      identity: selection,
      dataRevision: revision,
      timestamps: change.data.map((bar) => bar.timestamp),
      data: change.data,
      change: {
        start: change.start,
        end: change.end,
        reset:
          change.kind === DATA_CHANGE_KINDS.replace ||
          change.kind === DATA_CHANGE_KINDS.prepend ||
          change.kind === DATA_CHANGE_KINDS.extend,
      },
      live: liveBarTime !== undefined && liveBarTime === change.data.at(-1)?.timestamp,
      ...(closedBarTime === undefined ? {} : { closedBarTime }),
      market: { selection, instrument },
    })
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
    data,
    clock: options.clock,
    dispose() {
      if (disposed) return
      disposed = true
      unsubscribeDefinitions()
      unsubscribeSessions()
      unsubscribeBars()
      data.dispose()
      calculation.dispose()
    },
  }
}
