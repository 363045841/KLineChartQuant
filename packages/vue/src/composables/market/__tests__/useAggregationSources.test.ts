/** Vue 消费者共用 Core 策略，卸载只释放自身订阅。 */
import { MarketDataContext } from '@363045841yyt/klinechart-core/market-data'
import { describe, expect, it } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useAggregationSources } from '../useAggregationSources'
import { useMarketDataSourceCatalog } from '../useMarketDataSourceCatalog'

describe('market data Vue projection', () => {
  it('shares effective policy across consumers without localStorage writes', async () => {
    const context = new MarketDataContext()
    context.registry.register({
      source: { id: 'one', displayName: 'One' },
      probe: async () => ({ status: 'online', checkedAt: 1 }),
      catalog: { search: async () => [] },
    })
    const scope = effectScope()
    const projections = scope.run(() => {
      const catalog = useMarketDataSourceCatalog(context)
      return [useAggregationSources(catalog, context), useAggregationSources(catalog, context)]
    })!
    expect(projections[0]?.enabledNames.value).toEqual(['one'])
    context.registry.setConfig('one', { searchEnabled: false })
    await nextTick()
    expect(projections.map((item) => item.enabledNames.value)).toEqual([[], []])
    scope.stop()
    context.dispose()
  })
})
