/** 实时 K 线绑定边界：建流失败只能跳过该序列，不能让状态通知链中断。 */
import { afterEach, describe, expect, it } from 'vitest'

import { MarketDataCache } from '@/data/buffer/impl/marketDataCache.js'
import type { BarsSelection } from '@/data/buffer/impl/seriesRepository.js'
import {
  instrumentKeyFromSpec,
  SERIES_SELECTION_KIND,
} from '@/data/buffer/impl/seriesRepository.js'
import { marketDataProviderRegistry } from '@/data/provider/impl/registry.js'
import { createSignal } from '@/foundation/reactivity/signal.js'
import type { KLineData } from '@/foundation/types/price.js'
import {
  createTestProvider,
  instrumentFor,
  registerTestProvider,
  unregisterTestProvider,
} from '../../__tests__/helpers/chartDataManagerTestKit.js'
import { MarketRuntime } from '../impl/marketRuntime.js'
import type { ReadyMarketSession } from '../types.js'

afterEach(unregisterTestProvider)

describe('实时 K 线绑定边界', () => {
  it('能力声明 liveBars 但 Provider 没有流实现时只跳过，不抛穿通知链', () => {
    const provider = createTestProvider({})
    registerTestProvider(provider)
    const instrument = instrumentFor('MAIN')
    const selection: BarsSelection = {
      kind: SERIES_SELECTION_KIND.bars,
      instrumentKey: instrumentKeyFromSpec({
        market: 'CN',
        symbol: instrument.symbol,
        instrument,
      }),
      sourceId: 'test',
      period: 'daily',
      adjustment: 'none',
      barAggregation: 'original',
    }
    const session: ReadyMarketSession = {
      selection,
      instrument,
      capabilities: { ...provider.source.capabilities!, liveBars: true },
    }
    const cache = new MarketDataCache(marketDataProviderRegistry)
    try {
      expect(
        () =>
          new MarketRuntime({
            cache,
            session: createSignal<ReadyMarketSession | null>(session),
            visibleRange: createSignal({ start: 0, end: 1 }),
            data: createSignal<readonly KLineData[]>([]),
            needsTrades: () => false,
            publishTrades: () => {},
            reloadBars: async () => { throw new Error('Unexpected reload') },
            resolveBarsSelection: () => selection,
          }),
      ).not.toThrow()
    } finally {
      cache.destroy()
    }
  })
})
