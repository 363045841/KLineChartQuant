/** 验证同花顺 THS Provider 只通过统一 V1 协议访问行情服务。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { marketDataProviderRegistry } from '../provider/impl/registry'
import { thsMarketDataProvider } from '../provider/impl/sources/ths'

const fetchMock = vi.fn<typeof fetch>()

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const instrument = {
  id: 'ths:600519.SH',
  sourceId: 'ths',
  symbol: '600519.SH',
  name: '贵州茅台',
  assetClass: 'stock' as const,
  exchange: 'SH',
  sessionId: 'CN',
  currency: 'CNY',
  providerRef: { thscode: '600519.SH', assetType: 'a-share' },
  capabilities: {
    bars: { periods: ['daily'] as const, adjustments: ['none', 'qfq', 'hfq'] as const },
  },
}

describe('ths V1 provider', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    marketDataProviderRegistry.setConfig('ths', { baseUrl: undefined })
  })

  afterEach(() => {
    marketDataProviderRegistry.setConfig('ths', { baseUrl: undefined })
  })

  // 验证 Provider 已注册。
  it('registers the THS Provider', () => {
    expect(marketDataProviderRegistry.get('ths')).toBe(thsMarketDataProvider)
  })

  // 验证服务探测请求统一 V1 probe endpoint。
  it('probes through the V1 endpoint', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { status: 'online', checkedAt: 1 }, requestId: 'r1' }),
    )

    await expect(thsMarketDataProvider.probe()).resolves.toMatchObject({ status: 'online' })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8092/api/v1/market-data/sources/ths/probe',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  // 验证目录搜索读取 V1 envelope 并返回标准品种模型。
  it('searches instruments through V1', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { items: [instrument] }, requestId: 'r2' }))

    await expect(
      thsMarketDataProvider.catalog!.search({ keyword: '茅台', limit: 10 }),
    ).resolves.toEqual([instrument])
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8092/api/v1/market-data/instruments/search',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  // 验证日线请求走 V1 bars endpoint，并保留连接器返回的量纲声明。
  it('fetches daily bars through V1', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          instrumentId: instrument.id,
          period: 'daily',
          adjustment: 'none',
          barAggregation: 'original',
          timezone: 'Asia/Shanghai',
          volumeUnit: 'share',
          items: [{ timestamp: 1704067200000, open: 1, high: 2, low: 0.5, close: 1.5 }],
          olderData: 'available',
        },
        requestId: 'r3',
      }),
    )

    const series = await thsMarketDataProvider.bars!.fetch({
      instrument,
      period: 'daily',
      adjustment: 'none',
      barAggregation: 'original',
      limit: 30,
    })

    expect(series.data).toEqual([expect.objectContaining({ symbol: '600519.SH', close: 1.5 })])
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8092/api/v1/market-data/bars')
  })

  // 验证分钟级请求会触发源流转：连接器返回 UNSUPPORTED_CAPABILITY（非 2xx + error 信封），
  // 前端 Transport 必须把它映射为 KLineChartError 的 UNSUPPORTED_CAPABILITY 而非通用失败。
  it('maps unsupported period to UNSUPPORTED_CAPABILITY for source fallback', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: { code: 'UNSUPPORTED_CAPABILITY', message: '同花顺端外仅支持日线' },
          requestId: 'r4',
        },
        400,
      ),
    )

    await expect(
      thsMarketDataProvider.bars!.fetch({
        instrument,
        period: '1min',
        adjustment: 'none',
        barAggregation: 'original',
        limit: 30,
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' })
  })

  // 验证运行时 baseUrl 覆盖生效（数据源面板改址）。
  it('honours runtime baseUrl override', async () => {
    marketDataProviderRegistry.setConfig('ths', { baseUrl: 'http://127.0.0.1:9999' })
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { status: 'online', checkedAt: 1 }, requestId: 'r5' }),
    )

    await thsMarketDataProvider.probe()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9999/api/v1/market-data/sources/ths/probe',
      expect.objectContaining({ method: 'GET' }),
    )
  })
})
