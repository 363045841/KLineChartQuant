/**
 * 统一 V1 协议契约：gotdx / ths / mt5 共用同一套 probe / catalog / bars 规则。
 *
 * 各源的差异（默认端口、品种形状、周期能力、请求体字段）只体现在参数表行里；
 * 单源特有行为（timeshare、错误码映射、运行时 baseUrl、MT5 请求体）单独成例。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BarSeries, MarketDataProvider } from '../types'
import { marketDataProviderRegistry } from '../impl/registry'
import {
  gotdxMarketDataProvider,
  mt5MarketDataProvider,
  thsMarketDataProvider,
} from '../impl/sources/index'

const fetchMock = vi.fn<typeof fetch>()

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** 测试只依赖 catalog / bars 存在，缺失时显式失败而不是非空断言。 */
function catalogOf(provider: MarketDataProvider) {
  if (!provider.catalog) throw new Error(`${provider.source.id} has no catalog`)
  return provider.catalog
}

function barsOf(provider: MarketDataProvider) {
  if (!provider.bars) throw new Error(`${provider.source.id} has no bars`)
  return provider.bars
}

const gotdxInstrument = {
  id: 'gotdx:stock:1:600519',
  source: 'gotdx',
  symbol: '600519',
  name: '贵州茅台',
  instrumentType: 'stock' as const,
  exchange: 'SH',
  sessionId: 'CN',
  providerRef: { market: 1, kind: 'stock' },
  capabilities: {
    bars: { periods: ['daily'] as const, adjustments: ['none'] as const },
    timeShare: true,
  },
}

const thsInstrument = {
  id: 'ths:600519.SH',
  source: 'ths',
  symbol: '600519.SH',
  name: '贵州茅台',
  instrumentType: 'stock' as const,
  exchange: 'SH',
  sessionId: 'CN',
  currency: 'CNY',
  providerRef: { thscode: '600519.SH', assetType: 'a-share' },
  capabilities: {
    bars: { periods: ['daily'] as const, adjustments: ['none', 'qfq', 'hfq'] as const },
  },
}

const mt5Instrument = {
  id: 'mt5:XAUUSD',
  source: 'mt5',
  symbol: 'XAUUSD',
  name: 'Gold vs US Dollar',
  instrumentType: 'forex' as const,
  exchange: 'MT5',
  sessionId: 'MT5',
  providerRef: { symbol: 'XAUUSD' },
  capabilities: {
    bars: {
      periods: [
        '1min',
        '5min',
        '15min',
        '30min',
        '60min',
        '4h',
        'daily',
        'weekly',
        'monthly',
      ] as const,
      adjustments: ['none'] as const,
    },
  },
}

const sources = [
  {
    id: 'gotdx',
    provider: gotdxMarketDataProvider,
    baseUrl: 'http://127.0.0.1:8080',
    instrument: gotdxInstrument,
    barsData: {
      period: 'daily',
      adjustment: 'none',
      timezone: 'Asia/Shanghai',
      items: [{ timestamp: 1704067200000, open: 1, high: 2, low: 0.5, close: 1.5 }],
    },
    expectedBar: { symbol: '600519', close: 1.5 },
  },
  {
    id: 'ths',
    provider: thsMarketDataProvider,
    baseUrl: 'http://127.0.0.1:8092',
    instrument: thsInstrument,
    barsData: {
      period: 'daily',
      adjustment: 'none',
      barAggregation: 'original',
      timezone: 'Asia/Shanghai',
      volumeUnit: 'share',
      items: [{ timestamp: 1704067200000, open: 1, high: 2, low: 0.5, close: 1.5 }],
      olderData: 'available',
    },
    expectedBar: { symbol: '600519.SH', close: 1.5 },
  },
  {
    id: 'mt5',
    provider: mt5MarketDataProvider,
    baseUrl: 'http://127.0.0.1:8090',
    instrument: mt5Instrument,
    barsData: {
      period: '4h',
      adjustment: 'none',
      barAggregation: 'original',
      timezone: 'UTC',
      items: [
        { timestamp: 1000, open: 1, high: 2, low: 0, close: 1.5, volume: 10, turnover: 15 },
      ],
      olderData: 'available',
    },
    expectedBar: { symbol: 'XAUUSD', close: 1.5, turnover: 15 },
  },
] as const

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  for (const source of sources) {
    marketDataProviderRegistry.setConfig(source.id, { baseUrl: undefined })
  }
})

afterEach(() => {
  for (const source of sources) {
    marketDataProviderRegistry.setConfig(source.id, { baseUrl: undefined })
  }
  vi.unstubAllGlobals()
})

describe('V1 provider 契约', () => {
  it.each(sources)('$id 注册到共享 registry', ({ id, provider }) => {
    expect(marketDataProviderRegistry.get(id)).toBe(provider)
  })

  it.each(sources)('$id 通过 V1 probe 端点探测', async ({ id, provider, baseUrl }) => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { status: 'online', checkedAt: 1 }, requestId: 'r1' }),
    )

    await expect(provider.probe()).resolves.toMatchObject({ status: 'online' })
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/api/v1/market-data/sources/${id}/probe`,
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it.each(sources)('$id 通过 V1 搜索并归一化品种', async ({ provider, baseUrl, instrument }) => {
    const wireInstrument = { ...instrument, sourceId: instrument.source }
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { items: [wireInstrument] }, requestId: 'r2' }),
    )

    await expect(catalogOf(provider).search({ keyword: '茅台', limit: 10 })).resolves.toEqual([
      instrument,
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/api/v1/market-data/instruments/search`,
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it.each(sources)('$id 通过 V1 取 K 线并映射字段', async ({ provider, instrument, barsData, expectedBar }) => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: { instrumentId: instrument.id, ...barsData },
        requestId: 'r3',
      }),
    )

    const series: BarSeries = await barsOf(provider).fetch({
      instrument,
      period: barsData.period,
      adjustment: 'none',
      barAggregation: 'original',
      limit: 300,
    })

    expect(series.data[0]).toMatchObject(expectedBar)
    expect(series.timezone).toBe(barsData.timezone)
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(
      new RegExp(`/api/v1/market-data/bars$`),
    )
  })
})

describe('GOTDX 单源行为', () => {
  it('映射分时数据的价格、均价与成交额字段', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          instrumentId: gotdxInstrument.id,
          tradingDate: '2026-08-06',
          timezone: 'Asia/Shanghai',
          preClose: 1500,
          items: [{ timestamp: 1704067200000, price: 1501, average: 1500.5, amount: 100 }],
        },
        requestId: 'r4',
      }),
    )

    const provider = gotdxMarketDataProvider
    if (!provider.timeShare) throw new Error('gotdx has no timeShare')
    await expect(
      provider.timeShare.fetch({ instrument: gotdxInstrument, tradingDate: '2026-08-06' }),
    ).resolves.toMatchObject({ preClose: 1500, data: [expect.objectContaining({ amount: 100 })] })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8080/api/v1/market-data/timeshare')
  })
})

describe('THS 单源行为', () => {
  it('不支持的周期映射为 UNSUPPORTED_CAPABILITY 以触发源回退', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: { code: 'UNSUPPORTED_CAPABILITY', message: '同花顺不支持下述周期' },
          requestId: 'r5',
        },
        400,
      ),
    )

    await expect(
      barsOf(thsMarketDataProvider).fetch({
        instrument: thsInstrument,
        period: '1min',
        adjustment: 'none',
        barAggregation: 'original',
        limit: 30,
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' })
  })

  it('运行时 baseUrl 覆盖默认源地址', async () => {
    marketDataProviderRegistry.setConfig('ths', { baseUrl: 'http://127.0.0.1:9999' })
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { status: 'online', checkedAt: 1 }, requestId: 'r6' }),
    )

    await thsMarketDataProvider.probe()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9999/api/v1/market-data/sources/ths/probe',
      expect.objectContaining({ method: 'GET' }),
    )
  })
})

describe('MT5 单源行为', () => {
  it('搜索请求体携带 sourceId 与分页参数', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: { items: [{ ...mt5Instrument, sourceId: 'mt5' }] },
        requestId: 'r7',
      }),
    )

    const results = await catalogOf(mt5MarketDataProvider).search({ keyword: 'gold', limit: 10 })

    expect(results.map((item) => item.id)).toEqual(['mt5:XAUUSD'])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:8090/api/v1/market-data/instruments/search')
    expect(JSON.parse(init.body as string)).toEqual({
      // wire 字段完全由宿主绑定，这里只断言协议层必须出现的字段。
      sourceId: 'mt5',
      keyword: 'gold',
      limit: 10,
      instrumentTypes: undefined,
    })
  })
})
