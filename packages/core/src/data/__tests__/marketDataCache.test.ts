import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type BarPageStore, createIndexedDbBarStore } from '../buffer/impl/indexedDbBarStore'
import { MarketDataCache } from '../buffer/impl/marketDataCache'
import { MarketDataProviderRegistry } from '../provider/impl/registry'

function bar(timestamp: number) {
  return { timestamp, open: 1, high: 2, low: 0, close: 1, volume: 1 }
}

function page(
  data: Array<ReturnType<typeof bar>>,
  olderData: 'available' | 'exhausted' = 'exhausted',
) {
  return {
    instrumentId: 'test:BTCUSDT',
    period: 'daily' as const,
    adjustment: 'none' as const,
    barAggregation: 'original' as const,
    timezone: 'UTC',
    data,
    olderData,
  }
}

function createCache(
  fetch: (beforeTimestamp?: number, signal?: AbortSignal) => Promise<ReturnType<typeof page>>,
  store?: BarPageStore,
) {
  const registry = new MarketDataProviderRegistry()
  const instrument = {
    id: 'test:BTCUSDT',
    sourceId: 'test',
    symbol: 'BTCUSDT',
    name: 'Bitcoin',
    instrumentType: 'crypto' as const,
    exchange: 'BINANCE',
    capabilities: { bars: { periods: ['daily'] as const, adjustments: ['none'] as const } },
  }
  registry.register({
    source: {
      id: 'test',
      displayName: 'Test',
      capabilities: {
        instrumentTypes: ['crypto'],
        bars: { periods: ['daily'], adjustments: ['none'] },
      },
    },
    probe: async () => ({ status: 'online', checkedAt: 1 }),
    catalog: { search: async () => [instrument] },
    bars: { fetch: ({ beforeTimestamp, signal }) => fetch(beforeTimestamp, signal) },
  })
  return { cache: new MarketDataCache(registry, store), instrument }
}

function query(overrides: { limit?: number; beforeTimestamp?: number } = {}) {
  return {
    sourceId: 'test',
    symbol: 'BTCUSDT',
    exchange: 'BINANCE',
    instrumentType: 'crypto' as const,
    period: 'daily' as const,
    adjustment: 'none' as const,
    barAggregation: 'original' as const,
    limit: overrides.limit ?? 100,
    ...(overrides.beforeTimestamp === undefined
      ? {}
      : { beforeTimestamp: overrides.beforeTimestamp }),
  }
}

/** 60min 周期的夹具；与日线夹具分开，避免改动既有用例的周期语义。 */
const HOURLY_MS = 3600000

/** 构造一根小时线。 */
function hourlyBar(timestamp: number) {
  return { timestamp, open: 1, high: 2, low: 0, close: 1, volume: 1 }
}

/** 构造 60min 一页数据。 */
function hourlyPage(
  data: Array<ReturnType<typeof hourlyBar>>,
  olderData: 'available' | 'exhausted' = 'exhausted',
) {
  return {
    instrumentId: 'test:BTCUSDT',
    period: '60min' as const,
    adjustment: 'none' as const,
    barAggregation: 'original' as const,
    timezone: 'UTC',
    data,
    olderData,
  }
}

/** 装配一条只支持 60min 的缓存。 */
function createHourlyCache(
  fetch: (beforeTimestamp?: number, signal?: AbortSignal) => Promise<ReturnType<typeof hourlyPage>>,
  store?: BarPageStore,
) {
  const registry = new MarketDataProviderRegistry()
  const instrument = {
    id: 'test:BTCUSDT',
    sourceId: 'test',
    symbol: 'BTCUSDT',
    name: 'Bitcoin',
    instrumentType: 'crypto' as const,
    exchange: 'BINANCE',
    capabilities: { bars: { periods: ['60min' as const], adjustments: ['none' as const] } },
  }
  registry.register({
    source: {
      id: 'test',
      displayName: 'Test',
      capabilities: {
        instrumentTypes: ['crypto'],
        bars: { periods: ['60min' as const], adjustments: ['none'] },
      },
    },
    probe: async () => ({ status: 'online', checkedAt: 1 }),
    catalog: { search: async () => [instrument] },
    bars: { fetch: ({ beforeTimestamp, signal }) => fetch(beforeTimestamp, signal) },
  })
  return { cache: new MarketDataCache(registry, store), instrument }
}

/** 构造 60min 的查询参数。 */
function hourlyQuery(overrides: { limit?: number; beforeTimestamp?: number } = {}) {
  return {
    sourceId: 'test',
    symbol: 'BTCUSDT',
    exchange: 'BINANCE',
    instrumentType: 'crypto' as const,
    period: '60min' as const,
    adjustment: 'none' as const,
    barAggregation: 'original' as const,
    limit: overrides.limit ?? 100,
    ...(overrides.beforeTimestamp === undefined
      ? {}
      : { beforeTimestamp: overrides.beforeTimestamp }),
  }
}

describe('MarketDataCache', () => {
  // 每个用例从空落盘缓存开始，避免上一个用例的磁盘页改变请求次数。
  beforeEach(async () => {
    await createIndexedDbBarStore().clearAll()
  })
  it('serves a repeated latest page from the same in-memory snapshot', async () => {
    const fetch = vi.fn(async () => page([bar(20), bar(30)]))
    const { cache } = createCache(fetch)

    const first = await cache.queryBars(query())
    const repeated = await cache.queryBars(query())

    expect(fetch).toHaveBeenCalledOnce()
    expect(first.series.data.map((item) => item.timestamp)).toEqual([20, 30])
    expect(repeated.series.data.map((item) => item.timestamp)).toEqual([20, 30])
  })

  it('evicts the least recently used entry when the configured memory limit is exceeded', async () => {
    const fetch = vi.fn(async () => page([bar(30)]))
    const { cache, instrument } = createCache(fetch)
    const ethQuery = {
      ...query(),
      symbol: 'ETHUSDT',
      instrument: { ...instrument, id: 'test:ETHUSDT', symbol: 'ETHUSDT' },
    }
    const solQuery = {
      ...query(),
      symbol: 'SOLUSDT',
      instrument: { ...instrument, id: 'test:SOLUSDT', symbol: 'SOLUSDT' },
    }

    await cache.queryBars(query())
    await cache.queryBars(ethQuery)
    cache.setMaxBytes(cache.stats.peek().usedBytes)
    await cache.queryBars(query())
    await cache.queryBars(solQuery)
    await cache.queryBars(query())
    await cache.queryBars(ethQuery)

    expect(fetch).toHaveBeenCalledTimes(4)
    expect(cache.stats.peek()).toMatchObject({ maxBytes: expect.any(Number), entryCount: 2 })
  })

  it('requests an older page when the caller supplies a timestamp cursor', async () => {
    const fetch = vi.fn(async (beforeTimestamp?: number) =>
      beforeTimestamp === undefined
        ? page([bar(20), bar(30)], 'available')
        : page([bar(10), bar(15)]),
    )
    const { cache } = createCache(fetch)

    const latest = await cache.queryBars(query({ limit: 2 }))
    const older = await cache.queryBars(query({ limit: 2, beforeTimestamp: 20 }))

    expect(fetch).toHaveBeenNthCalledWith(1, undefined, expect.any(AbortSignal))
    expect(fetch).toHaveBeenNthCalledWith(2, 20, expect.any(AbortSignal))
    expect(latest.series.data.map((item) => item.timestamp)).toEqual([20, 30])
    expect(older.series.data.map((item) => item.timestamp)).toEqual([10, 15])
  })

  it('serves a timestamp-cursor page from cache when enough older bars are already merged', async () => {
    const fetch = vi.fn(async (beforeTimestamp?: number) =>
      beforeTimestamp === undefined
        ? page([bar(10), bar(20), bar(30)], 'available')
        : page([bar(5)]),
    )
    const { cache } = createCache(fetch)

    await cache.queryBars(query({ limit: 3 }))
    const fetched = await cache.queryBars(query({ limit: 2, beforeTimestamp: 20 }))
    const cached = await cache.queryBars(query({ limit: 1, beforeTimestamp: 10 }))

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetched.series.data.map((item) => item.timestamp)).toEqual([5, 10])
    expect(cached.series.data.map((item) => item.timestamp)).toEqual([5])
  })

  it('merges an unordered overlapping page and preserves the upstream correction', async () => {
    const corrected = { ...bar(20), close: 9 }
    const fetch = vi.fn(async (beforeTimestamp?: number) =>
      beforeTimestamp === undefined
        ? page([bar(30), bar(20)], 'available')
        : page([bar(15), corrected, bar(10)]),
    )
    const { cache } = createCache(fetch)

    await cache.queryBars(query({ limit: 2 }))
    await cache.queryBars(query({ limit: 3, beforeTimestamp: 31 }))
    const merged = await cache.queryBars(query({ limit: 4 }))

    expect(merged.series.data.map((item) => item.timestamp)).toEqual([10, 15, 20, 30])
    expect(merged.series.data.find((item) => item.timestamp === 20)?.close).toBe(9)
  })

  it('deduplicates concurrent requests for one series page', async () => {
    let resolveFetch!: (value: ReturnType<typeof page>) => void
    const fetch = vi.fn(
      () =>
        new Promise<ReturnType<typeof page>>((resolve) => {
          resolveFetch = resolve
        }),
    )
    const { cache } = createCache(fetch)

    const first = cache.queryBars(query({ limit: 10 }))
    const second = cache.queryBars(query({ limit: 10 }))
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    resolveFetch(page([bar(30)]))
    await expect(Promise.all([first, second])).resolves.toHaveLength(2)

    expect(fetch).toHaveBeenCalledOnce()
  })

  it('aborts active requests and rejects new queries after destruction', async () => {
    const fetch = vi.fn(
      (_before?: number, signal?: AbortSignal) =>
        new Promise<ReturnType<typeof page>>((_, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
        }),
    )
    const { cache } = createCache(fetch)

    const pending = cache.queryBars(query({ limit: 10 }))
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    cache.destroy()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await expect(cache.queryBars(query({ limit: 10 }))).rejects.toMatchObject({
      name: 'AbortError',
    })
  })

  it('rejects a late provider response after destruction without restoring the cache', async () => {
    let resolveFetch!: (value: ReturnType<typeof page>) => void
    const fetch = vi.fn(
      () =>
        new Promise<ReturnType<typeof page>>((resolve) => {
          resolveFetch = resolve
        }),
    )
    const { cache } = createCache(fetch)

    const pending = cache.queryBars(query({ limit: 10 }))
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    cache.destroy()
    resolveFetch(page([bar(30)]))

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects a non-advancing cursor page instead of silently duplicating data', async () => {
    const fetch = vi.fn(async () => page([bar(30)], 'available'))
    const { cache } = createCache(fetch)
    const target = query({ limit: 2, beforeTimestamp: 40 })

    await expect(cache.queryBars(target)).resolves.toBeDefined()
    await expect(cache.queryBars(target)).rejects.toThrow('did not advance cached coverage')
  })

  it('跨缓存实例读穿历史页，不再请求 Provider', async () => {
    const store = createIndexedDbBarStore()
    const fetch = vi.fn(async () => page([bar(10), bar(20)]))
    const first = createCache(fetch, store)
    await first.cache.queryBars(query({ limit: 2, beforeTimestamp: 30 }))
    await vi.waitFor(async () => expect((await store.stats()).pages).toBe(1))

    const reopened = createCache(fetch, store)
    const result = await reopened.cache.queryBars(query({ limit: 2, beforeTimestamp: 30 }))

    expect(fetch).toHaveBeenCalledOnce()
    expect(result.series.data.map((item) => item.timestamp)).toEqual([10, 20])
  })

  it('最新页回源校验发现上游修正时采用新值并作废落盘页', async () => {
    const store = createIndexedDbBarStore()
    const stale = vi.fn(async () => page([bar(20), bar(30)]))
    const first = createCache(stale, store)
    await first.cache.queryBars(query({ limit: 2 }))
    await vi.waitFor(async () => expect((await store.stats()).pages).toBe(1))

    const corrected = vi.fn(async () =>
      page([
        { ...bar(20), close: 9 },
        { ...bar(30), close: 9 },
      ]),
    )
    const reopened = createCache(corrected, store)
    const result = await reopened.cache.queryBars(query({ limit: 2 }))

    expect(result.series.data.map((item) => item.close)).toEqual([9, 9])
    await vi.waitFor(async () => expect((await store.stats()).pages).toBe(1))
  })

  it('自动校验正在使用的选择：发现修正时采用新值并作废落盘页', async () => {
    const store = createIndexedDbBarStore()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page([bar(20), bar(30)]))
      .mockResolvedValue(
        page([
          { ...bar(20), close: 9 },
          { ...bar(30), close: 9 },
        ]),
      )
    const { cache } = createCache(fetch, store)
    await cache.queryBars(query({ limit: 2 }))
    await vi.waitFor(async () => expect((await store.stats()).pages).toBe(1))

    const result = await cache.verifyActive()

    expect(result.corrected).toBe(true)
    const after = await cache.queryBars(query({ limit: 2 }))
    expect(after.series.data.map((item) => item.close)).toEqual([9, 9])
    // 修正后整段作废，只保留这一页新值。
    await vi.waitFor(async () => expect((await store.stats()).pages).toBe(1))
  })

  it('自动校验在没有在用选择时不发请求', async () => {
    const fetch = vi.fn(async () => page([bar(10), bar(20)]))
    const { cache } = createCache(fetch)

    const result = await cache.verifyActive()

    expect(result.corrected).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('落盘后把占用字节发布到缓存统计，供设置面板展示', async () => {
    const store = createIndexedDbBarStore()
    const fetch = vi.fn(async () => page([bar(10), bar(20)]))
    const { cache } = createCache(fetch, store)

    await cache.queryBars(query({ limit: 2, beforeTimestamp: 30 }))

    expect(cache.stats.peek().diskBytes).toBeGreaterThan(0)
  })

  it('校验历史缓存发现深历史被修正时作废落盘页', async () => {
    const store = createIndexedDbBarStore()
    const stale = vi.fn(async () => page([bar(10), bar(20)]))
    const first = createCache(stale, store)
    await first.cache.queryBars(query({ limit: 2, beforeTimestamp: 30 }))
    await vi.waitFor(async () => expect((await store.stats()).pages).toBe(1))

    const corrected = vi.fn(async () =>
      page([
        { ...bar(10), close: 9 },
        { ...bar(20), close: 9 },
      ]),
    )
    const reopened = createCache(corrected, store)
    const result = await reopened.cache.verifyPersistent()

    expect(result.corrected).toBe(true)
    await vi.waitFor(async () => expect((await store.stats()).pages).toBe(0))
  })

  it('60min 周期下连续分页照常合并', async () => {
    const fetch = vi.fn(async (beforeTimestamp?: number) =>
      beforeTimestamp === undefined
        ? hourlyPage([hourlyBar(0), hourlyBar(HOURLY_MS)], 'available')
        : hourlyPage([hourlyBar(-2 * HOURLY_MS), hourlyBar(-1 * HOURLY_MS)]),
    )
    const { cache } = createHourlyCache(fetch)

    await cache.queryBars(hourlyQuery({ limit: 2 }))
    const older = await cache.queryBars(hourlyQuery({ limit: 2, beforeTimestamp: 0 }))

    expect(older.series.data.map((item) => item.timestamp)).toEqual([
      -2 * HOURLY_MS,
      -1 * HOURLY_MS,
    ])
    const all = await cache.queryBars(hourlyQuery({ limit: 4 }))
    expect(all.series.data.map((item) => item.timestamp)).toEqual([
      -2 * HOURLY_MS,
      -1 * HOURLY_MS,
      0,
      HOURLY_MS,
    ])
  })

  it('60min 周期下页间缺口不拼成一条序列', async () => {
    const fetch = vi.fn(async (beforeTimestamp?: number) =>
      beforeTimestamp === undefined
        ? hourlyPage([hourlyBar(0), hourlyBar(HOURLY_MS)], 'available')
        : hourlyPage([hourlyBar(-14 * HOURLY_MS), hourlyBar(-13 * HOURLY_MS)]),
    )
    const { cache } = createHourlyCache(fetch)

    await cache.queryBars(hourlyQuery({ limit: 2 }))
    const older = await cache.queryBars(hourlyQuery({ limit: 2, beforeTimestamp: 0 }))

    // 早期页与已有段相隔 13 小时，缺口不会被拼接：带游标的查询宁可返回空，
    // 也不交出跨过缺口的序列。
    expect(older.series.data).toEqual([])
    const latest = await cache.queryBars(hourlyQuery({ limit: 2 }))
    expect(latest.series.data.map((item) => item.timestamp)).toEqual([0, HOURLY_MS])
  })

  it('校验历史缓存时回源缺少时间戳也算修正', async () => {
    const store = createIndexedDbBarStore()
    const fetch = vi.fn(async () => hourlyPage([hourlyBar(0), hourlyBar(HOURLY_MS)]))
    const first = createHourlyCache(fetch, store)
    await first.cache.queryBars(hourlyQuery({ limit: 2, beforeTimestamp: 2 * HOURLY_MS }))
    await vi.waitFor(async () => expect((await store.stats()).pages).toBe(1))

    // 回源只剩一根：另一根在上游消失了，落盘页已不可信。
    const shrunk = vi.fn(async () => hourlyPage([hourlyBar(HOURLY_MS)]))
    const reopened = createHourlyCache(shrunk, store)
    const result = await reopened.cache.verifyPersistent()

    expect(result.corrected).toBe(true)
    await vi.waitFor(async () => expect((await store.stats()).pages).toBe(0))
  })

  it('校验历史缓存一致时保留落盘页', async () => {
    const store = createIndexedDbBarStore()
    const fetch = vi.fn(async () => page([bar(10), bar(20)]))
    const first = createCache(fetch, store)
    await first.cache.queryBars(query({ limit: 2, beforeTimestamp: 30 }))
    await vi.waitFor(async () => expect((await store.stats()).pages).toBe(1))

    const reopened = createCache(fetch, store)
    const result = await reopened.cache.verifyPersistent()

    expect(result.corrected).toBe(false)
    expect((await store.stats()).pages).toBe(1)
  })
})
