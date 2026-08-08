/** 验证 GOTDX Provider 只通过统一 V1 协议访问行情服务。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { gotdxMarketDataProvider } from '../provider/sources/gotdx'
import { marketDataProviderRegistry } from '../provider/registry'

const fetchMock = vi.fn<typeof fetch>()

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const instrument = {
  id: 'gotdx:stock:1:600519',
  sourceId: 'gotdx',
  symbol: '600519',
  name: '贵州茅台',
  assetClass: 'stock' as const,
  exchange: 'SH',
  sessionId: 'CN',
  providerRef: { market: 1, kind: 'stock' },
  capabilities: {
    bars: { periods: ['daily'] as const, adjustments: ['none'] as const },
    timeShare: true,
  },
}

describe('gotdx V1 provider', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    marketDataProviderRegistry.setConfig('gotdx', { baseUrl: undefined })
  })

  afterEach(() => {
    marketDataProviderRegistry.setConfig('gotdx', { baseUrl: undefined })
  })

  // 验证 Provider 已注册且不依赖旧 DataFetcher 定义。
  it('registers the GOTDX Provider without a legacy fetcher', async () => {
    const { getRegisteredFetcher } = await import('../legacy/fetcherDefinitionRegistry')

    expect(marketDataProviderRegistry.get('gotdx')).toBe(gotdxMarketDataProvider)
    expect(getRegisteredFetcher('gotdx')).toBeUndefined()
  })

  // 验证服务探测请求统一 V1 probe endpoint。
  it('probes through the V1 endpoint', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { status: 'online', checkedAt: 1 }, requestId: 'r1' }),
    )

    await expect(gotdxMarketDataProvider.probe()).resolves.toMatchObject({ status: 'online' })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/api/v1/market-data/sources/gotdx/probe',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  // 验证目录搜索读取 V1 envelope 并返回标准品种模型。
  it('searches instruments through V1', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { items: [instrument] }, requestId: 'r2' }))

    await expect(
      gotdxMarketDataProvider.catalog!.search({ keyword: '茅台', limit: 10 }),
    ).resolves.toEqual([instrument])
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/api/v1/market-data/instruments/search',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  // 验证 K 线请求不会回退到旧 stock 或 ex endpoint。
  it('fetches bars through V1', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          instrumentId: instrument.id,
          period: 'daily',
          adjustment: 'none',
          timezone: 'Asia/Shanghai',
          items: [{ timestamp: 1704067200000, open: 1, high: 2, low: 0.5, close: 1.5 }],
        },
        requestId: 'r3',
      }),
    )

    const series = await gotdxMarketDataProvider.bars!.fetch({
      instrument,
      period: 'daily',
      adjustment: 'none',
      from: 1704067200000,
      to: 1704153600000,
    })

    expect(series.data).toEqual([expect.objectContaining({ symbol: '600519', close: 1.5 })])
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8080/api/v1/market-data/bars')
  })

  // 验证分时请求保留 V1 返回的昨收和成交额字段。
  it('fetches timeshare through V1', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          instrumentId: instrument.id,
          tradingDate: '2026-08-06',
          timezone: 'Asia/Shanghai',
          preClose: 1500,
          items: [{ timestamp: 1704067200000, price: 1501, average: 1500.5, amount: 100 }],
        },
        requestId: 'r4',
      }),
    )

    await expect(
      gotdxMarketDataProvider.timeShare!.fetch({ instrument, tradingDate: '2026-08-06' }),
    ).resolves.toMatchObject({ preClose: 1500, data: [expect.objectContaining({ amount: 100 })] })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8080/api/v1/market-data/timeshare')
  })
})
