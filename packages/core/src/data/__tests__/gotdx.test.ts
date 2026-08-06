import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { gotdxMarketDataProvider } from '../gotdx'
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
      expect.objectContaining({
        id: 'gotdx:stock:1:600519',
        assetClass: 'stock',
        sessionId: 'CN',
        symbol: '600519',
        description: '贵州茅台',
        exchange: 'SH',
        market: 'CN',
        source: 'gotdx',
        params: { market: 1 },
      }),
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
      expect.objectContaining({ symbol: '01810', market: 'HK', id: 'gotdx:ex:31:01810' }),
    ])
  })

  it('normalizes mainland fund extended symbols to the unified CN market', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        {
          symbol: '003760',
          description: '国泰中证500A',
          exchange: 'FUND',
          source: 'gotdx',
          params: { category: 33, kind: 'ex' },
        },
      ]),
    )
    const definition = getRegisteredFetcher('gotdx')

    await expect(definition?.searcher?.('gotdx', { query: '国泰中' })).resolves.toEqual([
      expect.objectContaining({
        symbol: '003760',
        market: 'CN',
        exchange: 'FUND',
        params: { category: 33, kind: 'ex' },
      }),
    ])
  })

  it('returns all search rows and leaves unsupported markets empty', async () => {
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
          symbol: 'IF2608',
          description: '沪深300期货',
          exchange: 'FUTURES',
          source: 'gotdx',
          params: { category: 47, kind: 'ex' },
        },
      ]),
    )
    const definition = getRegisteredFetcher('gotdx')

    await expect(definition?.searcher?.('gotdx', { query: '01810' })).resolves.toEqual([
      expect.objectContaining({ symbol: '01810', market: 'HK' }),
      expect.objectContaining({ symbol: 'IF2608', market: '', exchange: 'FUTURES' }),
    ])
  })

  it('keeps unmapped gotdx search rows with empty market instead of failing search', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        {
          symbol: 'IF2608',
          description: '沪深300期货',
          exchange: 'FUTURES',
          source: 'gotdx',
          params: { category: 47, kind: 'ex' },
        },
        {
          symbol: 'CBA07501',
          description: '同业存单总指数',
          exchange: 'EX-0',
          source: 'gotdx',
          params: { category: 0, kind: 'ex' },
        },
      ]),
    )
    const definition = getRegisteredFetcher('gotdx')

    await expect(definition?.searcher?.('gotdx', { query: '同业存单' })).resolves.toEqual([
      expect.objectContaining({ symbol: 'IF2608', market: '' }),
      expect.objectContaining({ symbol: 'CBA07501', market: '', exchange: 'EX-0' }),
    ])
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

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8080/api/stock/kline-by-date')
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

  // 验证统一目录 Provider 返回稳定 ID、资产类别和前端能力。
  it('exposes normalized instruments through MarketDataProvider', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          items: [
            {
              id: 'gotdx:stock:1:600519',
              sourceId: 'gotdx',
              symbol: '600519',
              name: '贵州茅台',
              assetClass: 'stock',
              exchange: 'SH',
              sessionId: 'CN',
              currency: 'CNY',
              providerRef: { market: 1, kind: 'stock' },
              capabilities: {
                bars: { periods: ['daily'], adjustments: ['qfq', 'hfq', 'none'] },
                timeShare: true,
              },
            },
          ],
        },
        requestId: 'test',
      }),
    )

    const result = await gotdxMarketDataProvider.catalog!.search({ keyword: '茅台', limit: 12 })

    expect(result).toEqual([
      expect.objectContaining({
        id: 'gotdx:stock:1:600519',
        sourceId: 'gotdx',
        symbol: '600519',
        name: '贵州茅台',
        assetClass: 'stock',
        exchange: 'SH',
        sessionId: 'CN',
        currency: 'CNY',
        providerRef: { market: 1, kind: 'stock' },
      }),
    ])
    expect(result[0]?.capabilities.bars?.adjustments).toEqual(['qfq', 'hfq', 'none'])
    expect(result[0]?.capabilities.timeShare).toBe(true)
  })

  // 验证统一 K 线查询继续调用 GOTDX 股票日期接口并附带序列元数据。
  it('fetches normalized bars through MarketDataProvider', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          instrumentId: 'gotdx:stock:1:600519',
          period: 'daily',
          adjustment: 'qfq',
          timezone: 'Asia/Shanghai',
          volumeUnit: 'lot',
          items: [
            {
              timestamp: 1785945600000,
              date: '2026-08-06',
              open: 10,
              high: 11,
              low: 9,
              close: 10.5,
              volume: 100,
              turnover: 1000,
            },
          ],
        },
        requestId: 'test',
      }),
    )

    const item = {
      id: 'gotdx:stock:1:600519',
      sourceId: 'gotdx',
      symbol: '600519',
      name: '贵州茅台',
      assetClass: 'stock' as const,
      exchange: 'SH',
      sessionId: 'CN',
      providerRef: { market: 1, kind: 'stock' },
      capabilities: {
        bars: {
          periods: ['daily'] as const,
          adjustments: ['qfq', 'none'] as const,
        },
      },
    }
    const result = await gotdxMarketDataProvider.bars!.fetch({
      instrument: item,
      period: 'daily',
      adjustment: 'qfq',
      from: Date.parse('2026-08-01T00:00:00Z'),
      to: Date.parse('2026-08-06T23:59:59Z'),
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8080/api/v1/market-data/bars')
    expect(result.instrumentId).toBe(item.id)
    expect(result.timezone).toBe('Asia/Shanghai')
    expect(result.volumeUnit).toBe('lot')
    expect(result.data[0]).toMatchObject({ close: 10.5, symbol: '600519' })
  })

  // 验证统一分时查询使用标准交易日并保留昨收元数据。
  it('fetches normalized timeshare through MarketDataProvider', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          instrumentId: 'gotdx:stock:1:600519',
          tradingDate: '2026-08-06',
          timezone: 'Asia/Shanghai',
          preClose: 10,
          volumeUnit: 'lot',
          items: [{ timestamp: 1785979800000, price: 10.2, average: 10.1, volume: 100 }],
        },
        requestId: 'test',
      }),
    )

    const item = {
      id: 'gotdx:stock:1:600519',
      sourceId: 'gotdx',
      symbol: '600519',
      name: '贵州茅台',
      assetClass: 'stock' as const,
      exchange: 'SH',
      sessionId: 'CN',
      providerRef: { market: 1, kind: 'stock' },
      capabilities: { timeShare: true },
    }
    const result = await gotdxMarketDataProvider.timeShare!.fetch({
      instrument: item,
      tradingDate: '2026-08-06',
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8080/api/v1/market-data/timeshare')
    expect(result).toMatchObject({
      instrumentId: item.id,
      tradingDate: '2026-08-06',
      timezone: 'Asia/Shanghai',
      preClose: 10,
      volumeUnit: 'lot',
    })
    expect(result.data[0]).toMatchObject({ price: 10.2, average: 10.1, volume: 100 })
  })

  // 验证相同 GOTDX 响应经旧 Fetcher 和新 Provider 得到完全一致的 K 线数据。
  it('keeps K-line data identical across legacy and Provider paths', async () => {
    const payload = [
      {
        DateTime: '2026-08-06T00:00:00+08:00',
        Open: 10,
        High: 11,
        Low: 9,
        Close: 10.5,
        Vol: 100,
        Amount: 1000,
        Turnover: 1,
        RisePrice: 0.5,
        RiseRate: 5,
        Amplitude: 20,
      },
    ]
    fetchMock.mockResolvedValueOnce(jsonResponse(payload)).mockResolvedValueOnce(
      jsonResponse({
        data: {
          instrumentId: 'gotdx:stock:1:600519',
          period: 'daily',
          adjustment: 'qfq',
          timezone: 'Asia/Shanghai',
          volumeUnit: 'lot',
          items: [
            {
              timestamp: 1785945600000,
              date: '2026-08-06',
              open: 10,
              high: 11,
              low: 9,
              close: 10.5,
              volume: 100,
              turnover: 1000,
              changePercent: 5,
              changeAmount: 0.5,
              turnoverRate: 1,
              amplitude: 20,
            },
          ],
        },
        requestId: 'test',
      }),
    )
    const definition = getRegisteredFetcher('gotdx')!
    const legacy = await definition.fetcher('gotdx', {
      symbol: '600519',
      period: 'daily',
      startDate: '2026-08-01',
      endDate: '2026-08-06',
      adjust: 'qfq',
      exchange: 'SH',
      params: { market: 1, kind: 'stock' },
    })
    const modern = await gotdxMarketDataProvider.bars!.fetch({
      instrument: {
        id: 'gotdx:stock:1:600519',
        sourceId: 'gotdx',
        symbol: '600519',
        name: '贵州茅台',
        assetClass: 'stock',
        exchange: 'SH',
        sessionId: 'CN',
        providerRef: { market: 1, kind: 'stock' },
        capabilities: {
          bars: { periods: ['daily'], adjustments: ['qfq'] },
        },
      },
      period: 'daily',
      adjustment: 'qfq',
      from: Date.parse('2026-08-01T00:00:00Z'),
      to: Date.parse('2026-08-06T00:00:00Z'),
    })

    expect(modern.data).toEqual(legacy)
  })

  // 验证相同 history-tick 响应经旧 Fetcher 和新 Provider 保持点列与昨收一致。
  it('keeps timeshare data identical across legacy and Provider paths', async () => {
    const payload = {
      preClose: 10,
      data: [
        {
          timestamp: '2026-08-06T09:30:00+08:00',
          Price: 10.2,
          Avg: 10.1,
          Volume: 100,
          Amount: 1020,
        },
      ],
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(payload)).mockResolvedValueOnce(
      jsonResponse({
        data: {
          instrumentId: 'gotdx:stock:1:600519',
          tradingDate: '2026-08-06',
          timezone: 'Asia/Shanghai',
          preClose: 10,
          volumeUnit: 'lot',
          items: [
            { timestamp: 1785979800000, price: 10.2, average: 10.1, volume: 100, amount: 1020 },
          ],
        },
        requestId: 'test',
      }),
    )
    const definition = getRegisteredFetcher('gotdx')!
    const legacy = await definition.timeShareFetcher!('gotdx', {
      symbol: '600519',
      date: 20260806,
      params: { market: 1, kind: 'stock' },
    })
    const modern = await gotdxMarketDataProvider.timeShare!.fetch({
      instrument: {
        id: 'gotdx:stock:1:600519',
        sourceId: 'gotdx',
        symbol: '600519',
        name: '贵州茅台',
        assetClass: 'stock',
        exchange: 'SH',
        sessionId: 'CN',
        providerRef: { market: 1, kind: 'stock' },
        capabilities: { timeShare: true },
      },
      tradingDate: '2026-08-06',
    })

    expect(modern.data).toEqual(Array.isArray(legacy) ? legacy : legacy.data)
    expect(modern.preClose).toBe(Array.isArray(legacy) ? null : legacy.preClose)
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

  it('maps extended-market timeshare without unverified metrics', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        preClose: 18.5,
        data: [{ timestamp: '2026-07-24T09:30:00+08:00', Price: 18.6, Avg: 18.55 }],
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
        },
      ],
    })
  })

  it('maps stock volume and index amount without synthesizing the missing metric', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          preClose: 8.3,
          data: [{ timestamp: '2026-07-30T09:30:00+08:00', Price: 8.7, Avg: 8.7, Volume: 7101 }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          preClose: 3828.47,
          data: [
            {
              timestamp: '2026-07-30T09:30:00+08:00',
              Price: 3812.11,
              Avg: 3812.11,
              Amount: 6_972_838_100,
            },
          ],
        }),
      )
    const definition = getRegisteredFetcher('gotdx')

    await expect(
      definition?.timeShareFetcher?.('gotdx', {
        symbol: '601360',
        params: { market: 1 },
        date: 20260730,
      }),
    ).resolves.toEqual({
      preClose: 8.3,
      data: [
        {
          timestamp: new Date('2026-07-30T09:30:00+08:00').getTime(),
          price: 8.7,
          average: 8.7,
          volume: 7101,
        },
      ],
    })
    await expect(
      definition?.timeShareFetcher?.('gotdx', {
        symbol: '000001',
        params: { market: 1 },
        date: 20260730,
      }),
    ).resolves.toEqual({
      preClose: 3828.47,
      data: [
        {
          timestamp: new Date('2026-07-30T09:30:00+08:00').getTime(),
          price: 3812.11,
          average: 3812.11,
          amount: 6_972_838_100,
        },
      ],
    })
  })

  it('preserves the API error message for unavailable extended-market timeshare', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: '该日期暂无历史分时数据' }, 422))
    const definition = getRegisteredFetcher('gotdx')

    await expect(
      definition?.timeShareFetcher?.('gotdx', {
        symbol: '00700',
        exchange: 'HK',
        params: { category: 31, kind: 'ex' },
        date: 20250908,
      }),
    ).rejects.toThrow('该日期暂无历史分时数据')
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
    expect(JSON.parse(String(init?.body))).toMatchObject({
      market: 0,
      code: '000001',
      date: 20260727,
    })
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
