/** 使用真实仓库和现有 Provider 夹具验证比较品种与 Request 的共享使用权与来源约定。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataBuffer } from '@/data/buffer/impl/dataBuffer.js'
import type { BarsCacheQuery } from '@/data/buffer/impl/marketDataCache.js'
import { MarketDataCache } from '@/data/buffer/impl/marketDataCache.js'
import {
  type BarsSelection,
  instrumentKeyFromSpec,
  SERIES_SELECTION_KIND,
} from '@/data/buffer/impl/seriesRepository.js'
import { marketDataProviderRegistry } from '@/data/provider/impl/registry.js'
import { createSignal } from '@/foundation/reactivity/signal.js'
import type { KLineData } from '@/foundation/types/price.js'
import {
  createTestProvider,
  instrumentFor,
  makeBarsPage,
  makeKLine,
  registerTestProvider,
  unregisterTestProvider,
} from '../../__tests__/helpers/chartDataManagerTestKit.js'
import { MarketRuntime } from '../impl/marketRuntime.js'
import type { ReadyMarketSession } from '../types.js'

afterEach(unregisterTestProvider)

/** 注册测试 Provider 并构造真实缓存、MarketRuntime 与查询记录；图表品种固定为 MAIN。 */
function createHarness() {
  const data = [makeKLine(100), makeKLine(200)]
  const provider = createTestProvider({ fetchBars: { fetch: async () => makeBarsPage(data) } })
  registerTestProvider(provider)
  const capabilities = provider.source.capabilities
  if (capabilities === undefined) throw new Error('Missing test capabilities')
  const selectionFor = (symbol: string): BarsSelection => ({
    kind: SERIES_SELECTION_KIND.bars,
    instrumentKey: instrumentKeyFromSpec({
      market: 'CN',
      symbol,
      instrument: instrumentFor(symbol),
    }),
    sourceId: 'test',
    period: 'daily',
    adjustment: 'none',
    barAggregation: 'original',
  })
  const cache = new MarketDataCache(marketDataProviderRegistry)
  const queries: BarsCacheQuery[] = []
  const queryBars = cache.queryBars.bind(cache)
  vi.spyOn(cache, 'queryBars').mockImplementation((query) => {
    queries.push(query)
    return queryBars(query)
  })
  const runtime = new MarketRuntime({
    cache,
    session: createSignal<ReadyMarketSession | null>({
      selection: selectionFor('MAIN'),
      instrument: instrumentFor('MAIN'),
      capabilities,
    }),
    visibleRange: createSignal({ start: 0, end: 2 }),
    data: createSignal<readonly KLineData[]>(data),
    needsTrades: () => false,
    publishTrades: () => {},
    reloadBars: async () => { throw new Error('Unexpected reload') },
    resolveBarsSelection: (instrument, period, adjustment, barAggregation) => ({
      ...selectionFor(instrument.symbol),
      period,
      adjustment,
      barAggregation,
    }),
  })
  return { runtime, cache, data, capabilities, selectionFor, queries }
}

describe('比较品种与 Request 共用行情', () => {
  it.each([false, true])(
    '临时计算不受指标 retain 取消，结束后释放独占 Buffer（失败=%s）',
    async (fail) => {
      const { runtime, cache, data, selectionFor } = createHarness()
      try {
        const task = runtime.withContext(data, async (market) => {
          await market.loadBars({ symbol: 'CMP', timeframe: 'D', source: 'test', calcBarsCount: 2 })
          runtime.retain(new Set())
          expect(cache.repository.getBars(selectionFor('CMP'))).toBeDefined()
          if (fail) throw new Error('temporary failure')
          return 42
        })
        if (fail) await expect(task).rejects.toThrow('temporary failure')
        else await expect(task).resolves.toBe(42)
        expect(cache.repository.getBars(selectionFor('CMP'))).toBeUndefined()
      } finally {
        runtime.dispose()
        cache.destroy()
      }
    },
  )

  it('临时租约与计划租约互不回收，结束后只释放自己', async () => {
    const { runtime, cache, data, selectionFor } = createHarness()
    try {
      const planOwner = 'plan-task'
      runtime.retain(new Set([planOwner]))
      await runtime
        .context(planOwner, data)
        .loadBars({ symbol: 'CMP', timeframe: 'D', source: 'test', calcBarsCount: 2 })
      expect(cache.repository.getBars(selectionFor('CMP'))).toBeDefined()

      await runtime.withContext(data, async (temporary) => {
        await temporary.loadBars({
          symbol: 'CMP',
          timeframe: 'D',
          source: 'test',
          calcBarsCount: 2,
        })
        // 计划重复提交快照只能回收自己的租约。
        runtime.retain(new Set([planOwner]))
        expect(cache.repository.getBars(selectionFor('CMP'))).toBeDefined()
      })

      // 临时租约退出后计划仍需要这份行情。
      expect(cache.repository.getBars(selectionFor('CMP'))).toBeDefined()

      runtime.retain(new Set())
      expect(cache.repository.getBars(selectionFor('CMP'))).toBeUndefined()
    } finally {
      runtime.dispose()
      cache.destroy()
    }
  })

  it.each(['comparison-first', 'request-first'])(
    '%s：最后使用者退出才释放 Buffer',
    async (order) => {
      const { runtime, cache, data, capabilities, selectionFor } = createHarness()
      try {
        const compared = selectionFor('CMP')
        const buffer = cache.repository.getOrCreateBars(compared, () => new DataBuffer())
        buffer.mergeData(data, 'exhausted', 'Asia/Shanghai')
        runtime.retainComparison(
          { selection: compared, instrument: instrumentFor('CMP'), capabilities },
          buffer,
        )
        const previousSnapshot = buffer.data.peek()
        const result = await runtime
          .context('script', data)
          .loadBars({ symbol: 'CMP', timeframe: 'D', source: 'test', calcBarsCount: 2 })
        expect(result.map((bar) => bar.close)).toEqual(data.map((bar) => bar.close))
        expect(cache.repository.getBars(compared)).toBe(buffer)
        expect(buffer.data.peek()).toBe(previousSnapshot)
        if (order === 'comparison-first') {
          expect(runtime.releaseComparison(compared)).toBe(false)
          expect(cache.repository.getBars(compared)).toBe(buffer)
          runtime.retain(new Set())
        } else {
          runtime.retain(new Set())
          expect(cache.repository.getBars(compared)).toBe(buffer)
          expect(runtime.releaseComparison(compared)).toBe(true)
        }
        expect(cache.repository.getBars(compared)).toBeUndefined()
      } finally {
        runtime.dispose()
        cache.destroy()
      }
    },
  )
})

describe('Request 来源约定', () => {
  it('同品种省略 source 时继承图表已解析来源', async () => {
    const { runtime, cache, data, queries } = createHarness()
    try {
      await runtime
        .context('script', data)
        .loadBars({ symbol: 'MAIN', timeframe: 'D', calcBarsCount: 2 })
      expect(queries[0]?.sourceId).toBe('test')
    } finally {
      runtime.dispose()
      cache.destroy()
    }
  })

  it('跨品种未指定 source 时直接拒绝，不做隐式选源', async () => {
    const { runtime, cache, data } = createHarness()
    try {
      await expect(
        runtime
          .context('script', data)
          .loadBars({ symbol: 'CMP', timeframe: 'D', calcBarsCount: 2 }),
      ).rejects.toThrow('跨品种 Request 必须显式指定 source')
    } finally {
      runtime.dispose()
      cache.destroy()
    }
  })
})
