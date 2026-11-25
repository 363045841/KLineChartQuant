/** 图表行情运行时：临时计算与比较品种共用 Buffer 的回归。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataBuffer } from '@/data/buffer/impl/dataBuffer.js'
import type { BarsCacheQuery } from '@/data/buffer/impl/marketDataCache.js'
import { MarketDataCache } from '@/data/buffer/impl/marketDataCache.js'
import {
  type BarsSelection,
  instrumentKeyFromSpec,
  SERIES_SELECTION_KIND,
} from '@/data/buffer/impl/seriesRepository.js'
import type { StreamEvent, StreamFrame, StreamHub } from '@/data/stream/types.js'
import { marketDataProviderRegistry } from '@/data/provider/impl/registry.js'
import { createSignal } from '@/foundation/reactivity/signal.js'
import type { KLineData } from '@/foundation/types/price.js'
import {
  createTestProvider,
  inactiveStreamHub,
  instrumentFor,
  makeBarsPage,
  makeKLine,
  makeTestSymbolSpec,
  registerTestProvider,
  unregisterTestProvider,
} from '../../__tests__/helpers/chartDataManagerTestKit.js'
import { MarketRuntime } from '../impl/marketRuntime.js'
import type { ReadyMarketSession } from '../types.js'

afterEach(unregisterTestProvider)

/** 注册测试 Provider 并构造真实缓存与 MarketRuntime；图表品种固定为 MAIN。 */
function createHarness(stream?: StreamHub) {
  const data = [makeKLine(100), makeKLine(200)]
  const provider = createTestProvider({ fetchBars: { fetch: async () => makeBarsPage(data) } })
  registerTestProvider(provider)
  const capabilities = provider.source.capabilities
  if (capabilities === undefined) throw new Error('Missing test capabilities')
  const selectionFor = (symbol: string): BarsSelection => ({
    kind: SERIES_SELECTION_KIND.bars,
    instrumentKey: instrumentKeyFromSpec(makeTestSymbolSpec(symbol)),
    source: 'test',
    period: 'daily',
    adjustment: 'none',
    barAggregation: 'original',
  })
  const cache = new MarketDataCache(marketDataProviderRegistry)
  if (stream) {
    cache.repository
      .getOrCreateBars(selectionFor('MAIN'), () => new DataBuffer())
      .mergePage(data, 'unknown', 'Asia/Shanghai')
  }
  const queries: BarsCacheQuery[] = []
  const queryBars = cache.queryBars.bind(cache)
  vi.spyOn(cache, 'queryBars').mockImplementation((query) => {
    queries.push(query)
    return queryBars(query)
  })
  const runtime = new MarketRuntime({
    stream: stream === undefined ? inactiveStreamHub : stream,
    cache,
    session: createSignal<ReadyMarketSession | null>({
      selection: selectionFor('MAIN'),
      instrument: instrumentFor('MAIN'),
      capabilities: stream ? { ...capabilities, liveBars: true } : capabilities,
    }),
    visibleRange: createSignal({ start: 0, end: 2 }),
    data: createSignal<readonly KLineData[]>(data),
    needsTrades: () => false,
    publishTrades: () => {},
    resyncBars: async () => {
      throw new Error('Unexpected resync')
    },
    resolveBarsSelection: (instrument, period, adjustment, barAggregation) => ({
      ...selectionFor(instrument.symbol),
      period,
      adjustment,
      barAggregation,
    }),
  })
  return { runtime, cache, data, capabilities, selectionFor, queries }
}

describe('临时计算与比较品种共用行情', () => {
  it.each([false, true])(
    '临时计算结束后释放独占 Buffer（失败=%s）',
    async (fail) => {
      const { runtime, cache, data, selectionFor } = createHarness()
      try {
        const task = runtime.withContext(data, async (market) => {
          await market.loadBars({ symbol: 'CMP', timeframe: 'D', source: 'test', calcBarsCount: 2 })
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

  it.each(['release-during-request', 'release-after-request'])(
    '%s：最后使用者退出才释放 Buffer',
    async (order) => {
      const { runtime, cache, data, capabilities, selectionFor } = createHarness()
      try {
        const compared = selectionFor('CMP')
        const buffer = cache.repository.getOrCreateBars(compared, () => new DataBuffer())
        buffer.mergePage(data, 'exhausted', 'Asia/Shanghai')
        runtime.retainComparison(
          { selection: compared, instrument: instrumentFor('CMP'), capabilities },
          buffer,
        )
        const previousSnapshot = buffer.data.peek()
        await runtime.withContext(data, async (market) => {
          const result = await market.loadBars({
            symbol: 'CMP',
            timeframe: 'D',
            source: 'test',
            calcBarsCount: 2,
          })
          expect(result.map((bar) => bar.close)).toEqual(data.map((bar) => bar.close))
          expect(cache.repository.getBars(compared)).toBe(buffer)
          expect(buffer.data.peek()).toBe(previousSnapshot)
          if (order === 'release-during-request') {
            // 请求仍持有使用权时只释放比较，不回收 Buffer。
            expect(runtime.releaseComparison(compared)).toBe(false)
            expect(cache.repository.getBars(compared)).toBe(buffer)
          }
        })
        expect(runtime.releaseComparison(compared)).toBe(true)
        expect(cache.repository.getBars(compared)).toBeUndefined()
      } finally {
        runtime.dispose()
        cache.destroy()
      }
    },
  )
})

describe('Request 来源约定', () => {
  it('实时订阅在历史返回前建立；推送不被旧历史覆盖，后续计算不重查历史', async () => {
    const receivers = new Map<string, (frame: StreamFrame) => void>()
    const stream: StreamHub = {
      subscribe: vi.fn((request) => ({
        request,
        onFrame(callback: (frame: StreamFrame) => void) {
          receivers.set(request.period!, callback)
          return () => receivers.delete(request.period!)
        },
        onEvent: () => () => {},
        close() {},
      })),
      resume() {},
      dispose() {},
    }
    const { runtime, cache, data } = createHarness(stream)
    try {
      const market = runtime.context('script', data)
      const original = vi.mocked(cache.queryBars).getMockImplementation()!
      let complete!: () => void
      vi.mocked(cache.queryBars).mockImplementationOnce(
        (query) =>
          new Promise((resolve, reject) => {
            complete = () => {
              void original(query).then(resolve, reject)
            }
          }),
      )
      const request = {
        symbol: 'MAIN',
        timeframe: 'D',
        mode: 'lower_tf' as const,
        calcBarsCount: 2,
      }
      const pending = market.loadBars(request)
      await vi.waitFor(() => expect(cache.queryBars).toHaveBeenCalledTimes(1))
      expect(receivers.has('daily')).toBe(true)
      const emit = receivers.get('daily')!
      emit({
        seq: 1,
        ts: 1,
        type: 'bar',
        state: 'forming',
        instrumentId: instrumentFor('MAIN').id,
        bar: { ...data[1]!, close: 999, volume: 10 },
      })
      complete()
      const result = await pending
      expect(result.at(-1)!.close).toBe(999)
      const count = vi.mocked(cache.queryBars).mock.calls.length
      emit({
        seq: 2,
        ts: 2,
        type: 'bar',
        state: 'forming',
        instrumentId: instrumentFor('MAIN').id,
        bar: { ...data[1]!, close: 1000, volume: 11 },
      })
      expect((await market.loadBars(request)).at(-1)!.close).toBe(1000)
      expect(cache.queryBars).toHaveBeenCalledTimes(count)
    } finally {
      runtime.dispose()
      cache.destroy()
    }
  })

  it('实时重算取消等待后复用同一历史加载，加载完成后重算不再查询历史', async () => {
    const { runtime, cache, data, queries } = createHarness()
    try {
      const market = runtime.context('script', data)
      const abort = new AbortController()
      const original = vi.mocked(cache.queryBars).getMockImplementation()!
      let complete!: () => void
      vi.mocked(cache.queryBars).mockImplementationOnce((query) => {
        queries.push(query)
        return new Promise((resolve, reject) => {
          complete = () => {
            void original(query).then(resolve, reject)
          }
          query.signal!.addEventListener('abort', () => reject(query.signal!.reason), {
            once: true,
          })
        })
      })
      const request = {
        symbol: 'MAIN',
        timeframe: 'D',
        mode: 'lower_tf' as const,
        calcBarsCount: 2,
      }
      const pending = market.loadBars(request, abort.signal)
      const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
      abort.abort()
      await rejected
      expect(queries[0]!.signal!.aborted).toBe(false)
      const replacement = market.loadBars(request)
      expect(cache.queryBars).toHaveBeenCalledTimes(1)
      complete()
      const next = await replacement
      expect(next.map((bar) => bar.time)).toEqual(data.map((bar) => bar.timestamp))
      await market.loadBars(request)
      expect(cache.queryBars).toHaveBeenCalledTimes(1)
    } finally {
      runtime.dispose()
      cache.destroy()
    }
  })

  it('lower_tf沿同一缓存链路加载，记录图表结束边界，并在高周期请求前拒绝或显式忽略', async () => {
    const { runtime, cache, data, queries } = createHarness()
    try {
      const market = runtime.context('script', data)
      const actual = await market.loadBars({
        symbol: 'MAIN',
        timeframe: 'D',
        mode: 'lower_tf',
        calcBarsCount: 2,
      })
      expect(actual.map((bar) => bar.time)).toEqual(data.map((bar) => bar.timestamp))
      expect(queries[0]?.beforeTimestamp).toBeDefined()
      const fetched = queries.length
      await expect(
        market.loadBars({ symbol: 'MAIN', timeframe: 'W', mode: 'lower_tf', calcBarsCount: 2 }),
      ).rejects.toThrow('不能高于主图')
      await expect(
        market.loadBars({
          symbol: 'MAIN',
          timeframe: 'W',
          mode: 'lower_tf',
          calcBarsCount: 2,
          ignoreInvalidTimeframe: true,
        }),
      ).resolves.toEqual([])
      expect(queries).toHaveLength(fetched)
    } finally {
      runtime.dispose()
      cache.destroy()
    }
  })

  it('同品种省略 source 时继承图表已解析来源', async () => {
    const { runtime, cache, data, queries } = createHarness()
    try {
      await runtime
        .context('script', data)
        .loadBars({ symbol: 'MAIN', timeframe: 'D', calcBarsCount: 2 })
      expect(queries[0]?.source).toBe('test')
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
