// 验证 HTTP Transport 的 URL 拼接、envelope 解析与错误映射；fetch 必须显式注入。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { KLineChartError } from '@/errors'
import {
  createHttpMarketDataTransport,
  DEFAULT_V1_BASE_URL,
  type HttpTransportOptions,
} from '../impl/httpTransport'

const fetchMock = vi.fn<typeof fetch>()

/** 用默认地址与桩 fetch 创建传输，用例只覆盖差异项。 */
function createTransport(overrides: Partial<HttpTransportOptions> = {}) {
  return createHttpMarketDataTransport({
    baseUrl: DEFAULT_V1_BASE_URL,
    fetchImpl: fetchMock,
    ...overrides,
  })
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('createHttpMarketDataTransport', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests future trading slots using the last bar timestamp and requested count', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: { anchorTimestamp: 100, futureTimestamps: [200, 300] },
        requestId: 'r',
      }),
    )
    const transport = createTransport()
    const calendar = await transport.fetchTradingCalendar!({
      sourceId: 'test',
      instrument: { id: 'a', symbol: 'A', exchange: 'X' },
      period: 'daily',
      adjustment: 'none',
      barAggregation: 'original',
      anchorTimestamp: 100,
      count: 2,
    })
    expect(calendar.futureTimestamps).toEqual([200, 300])
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${DEFAULT_V1_BASE_URL}/api/v1/market-data/trading-calendar`)
    expect(JSON.parse(String(init?.body))).toMatchObject({ anchorTimestamp: 100, count: 2 })
  })

  // 验证 probe 走 GET 并返回解包后的探测结果。
  it('probes a source through GET and unwraps the envelope', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          status: 'online',
          checkedAt: 1,
          capabilities: {
            instrumentTypes: ['stock'],
            bars: { periods: ['daily'], adjustments: ['none'] },
          },
        },
        requestId: 'r',
      }),
    )

    const transport = createTransport()
    await expect(transport.probe('gotdx')).resolves.toEqual({
      status: 'online',
      checkedAt: 1,
      capabilities: {
        instrumentTypes: ['stock'],
        bars: { periods: ['daily'], adjustments: ['none'] },
      },
    })
    expect(fetchMock).toHaveBeenCalledWith(
      `${DEFAULT_V1_BASE_URL}/api/v1/market-data/sources/gotdx/probe`,
      expect.objectContaining({ method: 'GET' }),
    )
  })

  // 验证 sourceId 参与 URL 编码，避免特殊字符破坏路径。
  it('URL-encodes the sourceId in the probe path', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { status: 'offline', checkedAt: 1 }, requestId: 'r' }),
    )

    const transport = createTransport()
    await transport.probe('my source')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${DEFAULT_V1_BASE_URL}/api/v1/market-data/sources/my%20source/probe`,
    )
  })

  // 验证目录搜索请求携带 sourceId/keyword/limit 并返回 items。
  it('searches instruments with the expected JSON body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { items: [] }, requestId: 'r' }))

    const transport = createTransport()
    const result = await transport.searchInstruments({
      sourceId: 'gotdx',
      keyword: '茅台',
      limit: 10,
    })

    expect(result).toEqual({ items: [] })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${DEFAULT_V1_BASE_URL}/api/v1/market-data/instruments/search`)
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      sourceId: 'gotdx',
      keyword: '茅台',
      limit: 10,
    })
  })

  // 验证 K 线请求携带品种、周期与向前分页游标。
  it('fetches bars with instrument and cursor parameters', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          instrumentId: 'gotdx:stock:1:600519',
          period: 'daily',
          adjustment: 'none',
          barAggregation: 'original',
          timezone: 'Asia/Shanghai',
          olderData: 'exhausted',
          items: [],
        },
        requestId: 'r',
      }),
    )

    const transport = createTransport()
    const result = await transport.fetchBars({
      sourceId: 'gotdx',
      instrument: { id: 'gotdx:stock:1:600519', symbol: '600519', exchange: 'SH' },
      period: 'daily',
      adjustment: 'none',
      barAggregation: 'original',
      limit: 500,
      beforeTimestamp: 2,
    })

    expect(result.items).toEqual([])
    expect(result.olderData).toBe('exhausted')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${DEFAULT_V1_BASE_URL}/api/v1/market-data/bars`)
    expect(JSON.parse(String(init?.body))).toMatchObject({
      sourceId: 'gotdx',
      period: 'daily',
      limit: 500,
      beforeTimestamp: 2,
    })
  })

  // 验证分时请求携带交易日。
  it('fetches timeshare with the trading date', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          instrumentId: 'gotdx:stock:1:600519',
          tradingDate: '2026-08-06',
          timezone: 'Asia/Shanghai',
          preClose: 1500,
          items: [],
        },
        requestId: 'r',
      }),
    )

    const transport = createTransport()
    const result = await transport.fetchTimeShare({
      sourceId: 'gotdx',
      instrument: { id: 'gotdx:stock:1:600519', symbol: '600519', exchange: 'SH' },
      tradingDate: '2026-08-06',
    })

    expect(result.preClose).toBe(1500)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${DEFAULT_V1_BASE_URL}/api/v1/market-data/timeshare`)
    expect(JSON.parse(String(init?.body))).toEqual({
      sourceId: 'gotdx',
      instrument: { id: 'gotdx:stock:1:600519', symbol: '600519', exchange: 'SH' },
      tradingDate: '2026-08-06',
    })
  })

  // 验证多日分时按 days 走 range endpoint。
  it('fetches a configurable timeshare range', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          instrumentId: 'gotdx:stock:1:600519',
          timezone: 'Asia/Shanghai',
          requestedDays: 5,
          days: [],
          olderData: 'unknown',
        },
        requestId: 'r',
      }),
    )

    const transport = createTransport()
    const fetchTimeShareRange = transport.fetchTimeShareRange
    if (!fetchTimeShareRange) throw new Error('HTTP transport must support timeshare ranges')
    const result = await fetchTimeShareRange({
      sourceId: 'gotdx',
      instrument: { id: 'gotdx:stock:1:600519', symbol: '600519', exchange: 'SH' },
      endTradingDate: '2026-08-06',
      days: 5,
    })

    expect(result.requestedDays).toBe(5)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${DEFAULT_V1_BASE_URL}/api/v1/market-data/timeshare/range`)
    expect(JSON.parse(String(init?.body))).toEqual({
      sourceId: 'gotdx',
      instrument: { id: 'gotdx:stock:1:600519', symbol: '600519', exchange: 'SH' },
      endTradingDate: '2026-08-06',
      days: 5,
    })
  })

  // 验证非 2xx 时透传后端 envelope 的 message。
  it('surfaces the error envelope message on failure', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: 'UPSTREAM_UNAVAILABLE', message: 'upstream down' }, requestId: 'r' },
        502,
      ),
    )

    const transport = createTransport()
    await expect(transport.probe('gotdx')).rejects.toThrow(/upstream down/)
  })

  // 验证错误码透传：确定性的 V1 拒绝成为稳定前端错误码。
  it.each([
    ['UNSUPPORTED_CAPABILITY', 'UNSUPPORTED_CAPABILITY'],
    ['INSTRUMENT_NOT_FOUND', 'INSTRUMENT_NOT_FOUND'],
  ] as const)('passes through %s as %s', async (serverErrorCode, chartErrorCode) => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: serverErrorCode, message: 'not available' }, requestId: 'r' },
        422,
      ),
    )

    const transport = createTransport()
    const error = await transport.probe('gotdx').catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(KLineChartError)
    expect((error as KLineChartError).code).toBe(chartErrorCode)
  })

  // 验证非 2xx 且无错误 envelope 时使用状态码消息，并带上 sourceLabel 前缀。
  it('falls back to a generic message when no error envelope is present', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 500 }))

    const transport = createTransport({ sourceLabel: 'gotdx' })
    await expect(transport.probe('gotdx')).rejects.toThrow(/\[gotdx\] V1 request failed: 500/)
  })

  // 验证成功响应缺少 data 字段时判定为非法 envelope。
  it('rejects a 2xx response without a data field', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ requestId: 'r' }))

    const transport = createTransport()
    const error = await transport.probe('gotdx').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(KLineChartError)
    expect((error as KLineChartError).message).toContain('invalid V1 response envelope')
  })

  // 验证原生网络异常统一包装为 FETCH_FAILED 并保留 cause。
  it('wraps native network errors as FETCH_FAILED', async () => {
    const networkError = new TypeError('Failed to fetch')
    fetchMock.mockRejectedValue(networkError)

    const transport = createTransport({ sourceLabel: 'gotdx' })
    const error = await transport.probe('gotdx').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(KLineChartError)
    expect((error as KLineChartError).code).toBe('FETCH_FAILED')
    expect((error as KLineChartError).message).toContain('[gotdx] network error')
    expect((error as KLineChartError).cause).toBe(networkError)
  })

  // 验证 signal 中止统一包装为 FETCH_ABORTED，调用方据此区分取消与失败。
  it('wraps AbortSignal aborts as FETCH_ABORTED', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    fetchMock.mockRejectedValue(abortError)

    const transport = createTransport({ sourceLabel: 'gotdx' })
    const error = await transport.probe('gotdx').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(KLineChartError)
    expect((error as KLineChartError).code).toBe('FETCH_ABORTED')
    expect((error as KLineChartError).cause).toBe(abortError)
  })

  // 验证 baseUrl 支持静态字符串。
  it('accepts a static base URL string', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { status: 'online', checkedAt: 1 }, requestId: 'r' }),
    )

    const transport = createTransport({ baseUrl: 'http://static.test' })
    await transport.probe('gotdx')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://static.test/api/v1/market-data/sources/gotdx/probe',
    )
  })

  // 验证 baseUrl 支持运行时动态解析。
  it('resolves the base URL lazily through the resolver', async () => {
    // Response body 只能读取一次，因此每次调用都构造新响应。
    fetchMock.mockImplementation(async () =>
      jsonResponse({ data: { status: 'online', checkedAt: 1 }, requestId: 'r' }),
    )

    let baseUrl = 'http://a.test'
    const transport = createTransport({ baseUrl: () => baseUrl })
    await transport.probe('gotdx')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://a.test/api/v1/market-data/sources/gotdx/probe',
    )

    baseUrl = 'http://b.test'
    await transport.probe('gotdx')
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'http://b.test/api/v1/market-data/sources/gotdx/probe',
    )
  })

  // 验证注入的 fetch 是唯一取数实现，全局 fetch 不参与。
  it('uses the injected fetch implementation only', async () => {
    const globalFetch = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', globalFetch)
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { status: 'online', checkedAt: 1 }, requestId: 'r' }),
    )

    const transport = createTransport()
    await transport.probe('gotdx')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(globalFetch).not.toHaveBeenCalled()
  })
})
