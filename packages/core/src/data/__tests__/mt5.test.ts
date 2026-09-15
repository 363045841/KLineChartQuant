/** 验证 MT5 Provider 通过统一 V1 协议访问 :8090 连接器，且 7x24 会话可供时区解析。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mt5MarketDataProvider } from '../provider/sources/mt5'
import { marketDataProviderRegistry } from '../provider/registry'
import type { InstrumentDescriptor } from '../provider/types'

const fetchMock = vi.fn<typeof fetch>()

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const instrument: InstrumentDescriptor = {
  id: 'mt5:XAUUSD',
  sourceId: 'mt5',
  symbol: 'XAUUSD',
  name: 'Gold vs US Dollar',
  assetClass: 'forex' as const,
  exchange: 'MT5',
  sessionId: 'MT5',
  providerRef: { symbol: 'XAUUSD' },
  capabilities: {
    bars: {
      periods: ['1min', '5min', '15min', '30min', '60min', '4h', 'daily', 'weekly', 'monthly'],
      adjustments: ['none'],
    },
  },
}

describe('mt5 V1 provider', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    marketDataProviderRegistry.setConfig('mt5', { baseUrl: undefined })
  })

  afterEach(() => {
    marketDataProviderRegistry.setConfig('mt5', { baseUrl: undefined })
  })

  it('registers itself in the shared provider registry', () => {
    expect(marketDataProviderRegistry.get('mt5')).toBe(mt5MarketDataProvider)
  })

  it('searches the instrument catalog on the mt5 endpoint', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { items: [instrument] }, requestId: 'r1' }),
    )

    const results = await mt5MarketDataProvider.catalog!.search({ keyword: 'gold', limit: 10 })

    expect(results.map((item) => item.id)).toEqual(['mt5:XAUUSD'])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:8090/api/v1/market-data/instruments/search')
    expect(JSON.parse(init.body as string)).toEqual({
      sourceId: 'mt5',
      keyword: 'gold',
      limit: 10,
      assetClasses: undefined,
    })
  })

  it('fetches bars through the V1 protocol and maps items to KLineData', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          instrumentId: 'mt5:XAUUSD',
          period: '4h',
          adjustment: 'none',
          timezone: 'UTC',
          items: [
            { timestamp: 1000, open: 1, high: 2, low: 0, close: 1.5, volume: 10, turnover: 15 },
          ],
          olderData: 'available',
        },
        requestId: 'r2',
      }),
    )

    const series = await mt5MarketDataProvider.bars!.fetch({
      instrument,
      period: '4h',
      adjustment: 'none',
      limit: 300,
    })

    expect(series.data).toEqual([
      {
        timestamp: 1000,
        open: 1,
        high: 2,
        low: 0,
        close: 1.5,
        volume: 10,
        turnover: 15,
        symbol: 'XAUUSD',
      },
    ])
    expect(series.timezone).toBe('UTC')
    expect(series.olderData).toBe('available')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:8090/api/v1/market-data/bars')
    const body = JSON.parse(init.body as string)
    expect(body.instrument).toEqual({
      id: 'mt5:XAUUSD',
      symbol: 'XAUUSD',
      exchange: 'MT5',
      providerRef: { symbol: 'XAUUSD' },
    })
  })
})
