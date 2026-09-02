import { describe, expect, it, vi } from 'vitest'

import { MarketDataCache } from '../buffer/marketDataCache'
import { MarketDataProviderRegistry } from '../provider/registry'

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
    timezone: 'UTC',
    data,
    olderData,
  }
}

function createCache(fetch: (before?: number, signal?: AbortSignal) => Promise<ReturnType<typeof page>>) {
  const registry = new MarketDataProviderRegistry()
  const instrument = {
    id: 'test:BTCUSDT',
    sourceId: 'test',
    symbol: 'BTCUSDT',
    name: 'Bitcoin',
    assetClass: 'crypto' as const,
    exchange: 'BINANCE',
    capabilities: { bars: { periods: ['daily'] as const, adjustments: ['none'] as const } },
  }
  registry.register({
    source: {
      id: 'test',
      displayName: 'Test',
      capabilities: {
        assetClasses: ['crypto'],
        bars: { periods: ['daily'], adjustments: ['none'] },
      },
    },
    probe: async () => ({ status: 'online', checkedAt: 1 }),
    catalog: { search: async () => [instrument] },
    bars: { fetch: ({ before, signal }) => fetch(before, signal) },
  })
  return { cache: new MarketDataCache(registry), instrument }
}

function query(overrides: { limit?: number; before?: number } = {}) {
  return {
    sourceId: 'test',
    symbol: 'BTCUSDT',
    exchange: 'BINANCE',
    assetClass: 'crypto' as const,
    period: 'daily' as const,
    adjustment: 'none' as const,
    limit: overrides.limit ?? 100,
    ...(overrides.before === undefined ? {} : { before: overrides.before }),
  }
}

describe('MarketDataCache', () => {
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

  it('requests an older page when the caller supplies a before cursor', async () => {
    const fetch = vi.fn(async (before?: number) =>
      before === undefined
        ? page([bar(20), bar(30)], 'available')
        : page([bar(10), bar(15)]),
    )
    const { cache } = createCache(fetch)

    const latest = await cache.queryBars(query({ limit: 2 }))
    const older = await cache.queryBars(query({ limit: 2, before: 20 }))

    expect(fetch).toHaveBeenNthCalledWith(1, undefined, expect.any(AbortSignal))
    expect(fetch).toHaveBeenNthCalledWith(2, 20, expect.any(AbortSignal))
    expect(latest.series.data.map((item) => item.timestamp)).toEqual([20, 30])
    expect(older.series.data.map((item) => item.timestamp)).toEqual([10, 15])
  })

  it('serves a before page from cache when enough older bars are already merged', async () => {
    const fetch = vi.fn(async (before?: number) =>
      before === undefined
        ? page([bar(10), bar(20), bar(30)], 'available')
        : page([bar(5)]),
    )
    const { cache } = createCache(fetch)

    await cache.queryBars(query({ limit: 3 }))
    const fetched = await cache.queryBars(query({ limit: 2, before: 20 }))
    const cached = await cache.queryBars(query({ limit: 1, before: 10 }))

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetched.series.data.map((item) => item.timestamp)).toEqual([5, 10])
    expect(cached.series.data.map((item) => item.timestamp)).toEqual([5])
  })

  it('merges an unordered overlapping page and preserves the upstream correction', async () => {
    const corrected = { ...bar(20), close: 9 }
    const fetch = vi.fn(async (before?: number) =>
      before === undefined
        ? page([bar(30), bar(20)], 'available')
        : page([bar(15), corrected, bar(10)]),
    )
    const { cache } = createCache(fetch)

    await cache.queryBars(query({ limit: 2 }))
    await cache.queryBars(query({ limit: 3, before: 31 }))
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
    await expect(cache.queryBars(query({ limit: 10 }))).rejects.toMatchObject({ name: 'AbortError' })
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
    const target = query({ limit: 2, before: 40 })

    await expect(cache.queryBars(target)).resolves.toBeDefined()
    await expect(cache.queryBars(target)).rejects.toThrow('did not advance cached coverage')
  })
})
