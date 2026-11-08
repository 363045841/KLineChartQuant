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
import type { LiveFrame, RealtimeSubscriptionPool } from '@/data/live/types.js'
import { marketDataProviderRegistry } from '@/data/provider/impl/registry.js'
import { createSignal } from '@/foundation/reactivity/signal.js'
import type { KLineData } from '@/foundation/types/price.js'
import {
  createTestProvider,
  inactiveRealtimePool,
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
function createHarness(realtime?: RealtimeSubscriptionPool) {
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
  if (realtime) {
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
    realtime: realtime === undefined ? inactiveRealtimePool : realtime,
    cache,
    session: createSignal<ReadyMarketSession | null>({
      selection: selectionFor('MAIN'),
      instrument: instrumentFor('MAIN'),
      capabilities: realtime ? { ...capabilities, liveBars: true } : capabilities,
    }),
    visibleRange: createSignal({ start: 0, end: 2 }),
    data: createSignal<readonly KLineData[]>(data),
    needsTrades: () => false,
    publishTrades: () => {},
    reloadBars: async () => {
      throw new Error('Unexpected reload')
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
        buffer.mergePage(data, 'exhausted', 'Asia/Shanghai')
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
  it('相同数据需求共享历史准备，最后一个使用者退出才取消请求', async () => {
    const { runtime, cache, data } = createHarness()
    try {
      runtime.retain(new Set(['a', 'b']))
      let signal!: AbortSignal
      vi.mocked(cache.queryBars).mockImplementationOnce((query) => {
        signal = query.signal!
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
      })
      const request = {
        symbol: 'MAIN',
        timeframe: 'D',
        mode: 'lower_tf' as const,
        calcBarsCount: 2,
      }
      const first = runtime.context('a', data).loadBars(request)
      const second = runtime.context('b', data).loadBars(request)
      const firstRejected = expect(first).rejects.toMatchObject({ name: 'AbortError' })
      const secondRejected = expect(second).rejects.toMatchObject({ name: 'AbortError' })
      await vi.waitFor(() => expect(cache.queryBars).toHaveBeenCalledTimes(1))
      runtime.retain(new Set(['b']))
      expect(signal.aborted).toBe(false)
      runtime.retain(new Set())
      expect(signal.aborted).toBe(true)
      await Promise.all([firstRejected, secondRejected])
    } finally {
      runtime.dispose()
      cache.destroy()
    }
  })

  it('实时订阅在历史返回前建立；推送不被旧历史覆盖，后续计算不重查历史', async () => {
    const receivers = new Map<string, (frame: LiveFrame) => void>()
    const realtime: RealtimeSubscriptionPool = {
      subscribe: vi.fn((request) => ({
        request,
        onFrame(callback: (frame: LiveFrame) => void) {
          receivers.set(request.period!, callback)
          return () => receivers.delete(request.period!)
        },
        onStatus: () => () => {},
        onError: () => () => {},
        close() {},
      })),
      dispose() {},
    }
    const { runtime, cache, data } = createHarness(realtime)
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
        channel: 'bars',
        type: 'forming',
        instrumentId: instrumentFor('MAIN').id,
        bar: { ...data[1]!, close: 999, volume: 10 },
      })
      complete()
      const result = await pending
      expect(result.at(-1)!.close).toBe(999)
      const count = vi.mocked(cache.queryBars).mock.calls.length
      emit({
        channel: 'bars',
        type: 'forming',
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
          ignore_invalid_timeframe: true,
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
