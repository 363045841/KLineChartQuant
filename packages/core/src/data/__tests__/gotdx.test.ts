import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import '../gotdx'
import { clearFetcherBaseUrlsForTest, setFetcherBaseUrl } from '../fetcherBaseUrl'
import { getRegisteredFetcher } from '../fetcherDefinitionRegistry'

const fetchMock = vi.fn<typeof fetch>()

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('gotdx fetcher', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    clearFetcherBaseUrlsForTest()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    clearFetcherBaseUrlsForTest()
  })

  it('declares and implements symbol search', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        {
          symbol: '600519',
          description: '贵州茅台',
          exchange: 'SH',
          source: 'gotdx',
          params: { market: 1 },
        },
      ]),
    )
    const definition = getRegisteredFetcher('gotdx')

    expect(definition?.capabilities).toContain('search')
    await expect(definition?.searcher?.('gotdx', { query: '茅台', limit: 12 })).resolves.toEqual([
      {
        symbol: '600519',
        description: '贵州茅台',
        exchange: 'SH',
        market: 'CN',
        source: 'gotdx',
        params: { market: 1 },
      },
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/api/symbol/search',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ query: '茅台', limit: 12 }),
      }),
    )
  })

  it('normalizes Hong Kong extended symbols to the unified HK market', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        {
          symbol: '01810',
          description: '小米集团-W',
          exchange: 'HK',
          source: 'gotdx',
          params: { category: 31, kind: 'ex' },
        },
      ]),
    )
    const definition = getRegisteredFetcher('gotdx')

    await expect(definition?.searcher?.('gotdx', { query: '01810' })).resolves.toEqual([
      expect.objectContaining({ symbol: '01810', market: 'HK' }),
    ])
  })

  it('keeps supported results when the same response contains unsupported markets', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        {
          symbol: '01810',
          description: '小米集团-W',
          exchange: 'HK',
          source: 'gotdx',
          params: { category: 31, kind: 'ex' },
        },
        {
          symbol: '018100',
          description: '太平恒泰3月定债A',
          exchange: 'FUND',
          source: 'gotdx',
          params: { category: 33, kind: 'ex' },
        },
      ]),
    )
    const definition = getRegisteredFetcher('gotdx')

    await expect(definition?.searcher?.('gotdx', { query: '01810' })).resolves.toEqual([
      expect.objectContaining({ symbol: '01810', market: 'HK' }),
    ])
  })

  it('rejects gotdx search metadata that cannot be normalized', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        {
          symbol: 'IF2608',
          description: '沪深300期货',
          exchange: 'FUTURES',
          source: 'gotdx',
          params: { category: 47, kind: 'ex' },
        },
      ]),
    )
    const definition = getRegisteredFetcher('gotdx')

    await expect(definition?.searcher?.('gotdx', { query: 'IF2608' })).rejects.toThrow(
      /cannot normalize market.*IF2608/i,
    )
  })

  it('uses params.market for stock requests', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]))
    const definition = getRegisteredFetcher('gotdx')

    await definition?.fetcher('gotdx', {
      symbol: '920001',
      period: 'daily',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      adjust: 'none',
      exchange: 'BJ',
      params: { market: 2 },
    })

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('http://127.0.0.1:8080/api/stock/kline-by-date')
    expect(JSON.parse(String(init?.body))).toMatchObject({ market: 2, code: '920001' })
  })

  it('uses the default gotdx API base URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]))
    const definition = getRegisteredFetcher('gotdx')

    await definition?.fetcher('gotdx', {
      symbol: '600519',
      period: 'daily',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      adjust: 'none',
      exchange: 'SH',
      params: { market: 1 },
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://127.0.0.1:8080/api/stock/kline-by-date',
    )
  })

  it('uses runtime base URL override from aggregation source config', async () => {
    setFetcherBaseUrl('gotdx', 'http://gotdx.test:9090///')
    fetchMock.mockResolvedValue(jsonResponse([]))
    const definition = getRegisteredFetcher('gotdx')

    await definition?.fetcher('gotdx', {
      symbol: '600519',
      period: 'daily',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      adjust: 'none',
      exchange: 'SH',
      params: { market: 1 },
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://gotdx.test:9090/api/stock/kline-by-date')
  })

  it('uses params.category for extended-market requests', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]))
    const definition = getRegisteredFetcher('gotdx')

    await definition?.fetcher('gotdx', {
      symbol: '00700',
      period: 'daily',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      adjust: 'none',
      exchange: 'HK',
      params: { category: 31 },
    })

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('http://127.0.0.1:8080/api/ex/kline-by-date')
    expect(JSON.parse(String(init?.body))).toMatchObject({ category: 31, code: '00700' })
  })

  it('rejects stock requests without params.market or params.category', async () => {
    const definition = getRegisteredFetcher('gotdx')

    await expect(
      definition?.fetcher('gotdx', {
        symbol: '000001',
        period: 'daily',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        adjust: 'none',
        exchange: 'SZ',
      }),
    ).rejects.toThrow(/params\.market or params\.category/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not infer market from exchange alone', async () => {
    const definition = getRegisteredFetcher('gotdx')

    await expect(
      definition?.fetcher('gotdx', {
        symbol: '00700',
        period: 'daily',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        adjust: 'none',
        exchange: 'HK',
      }),
    ).rejects.toThrow(/params\.market or params\.category/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('wraps search HTTP failures', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'offline' }, 503))
    const definition = getRegisteredFetcher('gotdx')

    await expect(definition?.searcher?.('gotdx', { query: 'test' })).rejects.toThrow(
      /symbol search failed: 503/,
    )
  })

  it('routes HK timeshare by params.category to ex/history-tick', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        preClose: 18.5,
        data: [{ timestamp: '2026-07-24T09:30:00+08:00', Price: 18.6, Avg: 18.55, Vol: 100 }],
      }),
    )
    const definition = getRegisteredFetcher('gotdx')

    const result = await definition?.timeShareFetcher?.('gotdx', {
      symbol: '01810',
      exchange: 'HK',
      params: { category: 31, kind: 'ex' },
      date: 20260724,
    })

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('http://127.0.0.1:8080/api/ex/history-tick')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      category: 31,
      code: '01810',
      date: 20260724,
    })
    expect(result).toEqual({
      preClose: 18.5,
      data: [
        {
          timestamp: new Date('2026-07-24T09:30:00+08:00').getTime(),
          price: 18.6,
          average: 18.55,
          volume: 100,
          amount: 18.6 * 100,
        },
      ],
    })
  })

  it('routes A-share timeshare by params.market to stock/history-tick', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        preClose: 8.3,
        data: [{ timestamp: '2026-07-27T09:30:00+08:00', Price: 8.5, Avg: 8.5, Vol: 100 }],
      }),
    )
    const definition = getRegisteredFetcher('gotdx')

    await definition?.timeShareFetcher?.('gotdx', {
      symbol: '000001',
      params: { market: 0 },
      date: 20260727,
    })

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('http://127.0.0.1:8080/api/stock/history-tick')
    expect(JSON.parse(String(init?.body))).toMatchObject({ market: 0, code: '000001', date: 20260727 })
  })

  it('rejects timeshare without params.market or params.category', async () => {
    const definition = getRegisteredFetcher('gotdx')

    await expect(
      definition?.timeShareFetcher?.('gotdx', {
        symbol: '01810',
        exchange: 'HK',
        date: 20260724,
      }),
    ).rejects.toThrow(/params\.market or params\.category/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects the legacy array history-tick protocol', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([{ timestamp: '2026-07-27T09:30:00+08:00', Price: 8.5, Avg: 8.5, Vol: 100 }]),
    )
    const definition = getRegisteredFetcher('gotdx')

    await expect(
      definition?.timeShareFetcher?.('gotdx', {
        symbol: '000001',
        params: { market: 0 },
        date: 20260727,
      }),
    ).rejects.toThrow(/incompatible history-tick response/i)
  })

  it.each([null, {}, { preClose: 8.3, data: 'invalid' }, { preClose: -1, data: [] }])(
    'rejects a malformed history-tick protocol response: %j',
    async (payload) => {
      fetchMock.mockResolvedValue(jsonResponse(payload))
      const definition = getRegisteredFetcher('gotdx')

      await expect(
        definition?.timeShareFetcher?.('gotdx', {
          symbol: '000001',
          params: { market: 0 },
          date: 20260727,
        }),
      ).rejects.toThrow(/incompatible history-tick response/i)
    },
  )
})
