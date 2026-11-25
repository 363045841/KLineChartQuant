/** 指标行情需求：共享加载与最后使用者退出后的取消语义。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BarsCacheQuery } from '@/data/buffer/impl/marketDataCache.js'
import { MarketDataCache } from '@/data/buffer/impl/marketDataCache.js'
import {
  type BarsSelection,
  instrumentKeyFromSpec,
  SERIES_SELECTION_KIND,
} from '@/data/buffer/impl/seriesRepository.js'
import { marketDataProviderRegistry } from '@/data/provider/impl/registry.js'
import { MarketSessionRegistry } from '@/foundation/config/marketSession/marketSessionRegistry.js'
import type { KLineData } from '@/foundation/types/price.js'
import {
  createTestProvider,
  instrumentFor,
  makeBarsPage,
  makeKLine,
  makeTestSymbolSpec,
  registerTestProvider,
  unregisterTestProvider,
} from '../../__tests__/helpers/chartDataManagerTestKit.js'
import { IndicatorBarsRepository } from '../impl/indicatorBarsRepository.js'
import type { ReadyMarketSession } from '../types.js'

afterEach(unregisterTestProvider)

/** 构造只读需求仓库；bind 不建立实时流，测试只关心历史加载与租约。 */
function createHarness() {
  const data = [makeKLine(100), makeKLine(200)]
  const provider = createTestProvider({ fetchBars: { fetch: async () => makeBarsPage(data) } })
  registerTestProvider(provider)
  const capabilities = provider.source.capabilities
  if (capabilities === undefined) throw new Error('Missing test capabilities')
  const selection: BarsSelection = {
    kind: SERIES_SELECTION_KIND.bars,
    instrumentKey: instrumentKeyFromSpec(makeTestSymbolSpec('MAIN')),
    source: 'test',
    period: 'daily',
    adjustment: 'none',
    barAggregation: 'original',
  }
  const cache = new MarketDataCache(marketDataProviderRegistry)
  const queries: BarsCacheQuery[] = []
  const queryBars = cache.queryBars.bind(cache)
  vi.spyOn(cache, 'queryBars').mockImplementation((query) => {
    queries.push(query)
    return queryBars(query)
  })
  const repository = new IndicatorBarsRepository({
    cache,
    registry: marketDataProviderRegistry,
    sessions: new MarketSessionRegistry(),
    resolveSelection: (_instrument, period, adjustment, barAggregation) => ({
      ...selection,
      period,
      adjustment,
      barAggregation,
    }),
    bind: () => {},
  })
  const session: ReadyMarketSession = {
    selection,
    instrument: instrumentFor('MAIN'),
    capabilities,
  }
  return { repository, cache, data, queries, session }
}

describe('指标行情需求租约', () => {
  it('相同数据需求共享历史准备，最后一个使用者退出才取消请求', async () => {
    const { repository, cache, data, session } = createHarness()
    const request = {
      symbol: 'MAIN',
      timeframe: 'D',
      mode: 'lower_tf' as const,
      calcBarsCount: 2,
    }
    try {
      repository.retain(new Set(['a', 'b']))
      let signal!: AbortSignal
      vi.mocked(cache.queryBars).mockImplementationOnce((query) => {
        signal = query.signal!
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
      })
      const first = repository.read('a', data, request, session)
      const second = repository.read('b', data, request, session)
      const firstRejected = expect(first).rejects.toMatchObject({ name: 'AbortError' })
      const secondRejected = expect(second).rejects.toMatchObject({ name: 'AbortError' })
      await vi.waitFor(() => expect(cache.queryBars).toHaveBeenCalledTimes(1))
      repository.retain(new Set(['b']))
      expect(signal.aborted).toBe(false)
      repository.retain(new Set())
      expect(signal.aborted).toBe(true)
      await Promise.all([firstRejected, secondRejected])
    } finally {
      repository.clear()
      cache.destroy()
    }
  })
})
