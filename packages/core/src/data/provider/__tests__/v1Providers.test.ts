/**
 * 统一 V1 协议契约：gotdx / ths / mt5 走同一套 probe / catalog / bars 流程。
 *
 * 数据源差异（默认端口、品种形状、成交量口径）只体现在参数表里；装配差异
 * （fetch、事件流）由宿主注入，测试显式提供替身而不依赖全局状态。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DataSource } from '@363045841yyt/klinechart-plot-contracts'
import type { BarSeries, MarketDataProvider } from '../types'
import { MarketDataProviderRegistry } from '../registry'
import { installBuiltinProviders } from '../impl/sources/index'
import { unavailableEventStream } from '../../stream/__tests__/helpers/eventStreamKit'

const fetchMock = vi.fn<typeof fetch>()
const registry = new MarketDataProviderRegistry()
installBuiltinProviders(registry, {
  // 装配期不建连；网络调用统一走用例桩。
  fetchImpl: (input, init) => fetchMock(input, init),
  openEventStream: unavailableEventStream,
})
const gotdxMarketDataProvider = registry.getRequired(DataSource.gotdx)
const mt5MarketDataProvider = registry.getRequired(DataSource.mt5)
const thsMarketDataProvider = registry.getRequired(DataSource.ths)

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** 只读取 catalog / bars 端口；缺失时显式失败而不是造空对象。 */
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
  for (const source of sources) {
    registry.setConfig(source.id, { baseUrl: undefined })
  }
})

afterEach(() => {
  for (const source of sources) {
    registry.setConfig(source.id, { baseUrl: undefined })
  }
})

describe('V1 provider 契约', () => {
  it.each(sources)('$id 注册到共享 registry', ({ id, provider }) => {
    expect(registry.get(id)).toBe(provider)
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

  it.each(sources)('$id 通过 V1 检索到一个品种', async ({ provider, baseUrl, instrument }) => {
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
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(new RegExp(`/api/v1/market-data/bars$`))
  })
})

describe('GOTDX 源行为', () => {
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

describe('THS 源行为', () => {
  it('把不支持的周期映射为 UNSUPPORTED_CAPABILITY 以便换源', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: { code: 'UNSUPPORTED_CAPABILITY', message: '同花顺不支持该周期' },
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
    registry.setConfig('ths', { baseUrl: 'http://127.0.0.1:9999' })
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

describe('MT5 源行为', () => {
  it('品种检索请求携带 sourceId 与查询词', async () => {
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
      // wire 字段与后端结构体绑定；这里只断言协议声明的字段。
      sourceId: 'mt5',
      keyword: 'gold',
      limit: 10,
      instrumentTypes: undefined,
    })
  })
})
