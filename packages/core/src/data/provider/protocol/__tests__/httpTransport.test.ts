// 验证 HTTP Transport 的 URL 拼装、envelope 解包与错误解析行为
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { KLineChartError } from '../../../../errors'
import { createHttpMarketDataTransport, DEFAULT_V1_BASE_URL } from '../httpTransport'

const fetchMock = vi.fn<typeof fetch>()

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('createHttpMarketDataTransport', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // 验证 probe 走 GET 并返回解包后的探测结果
  it('probes a source through GET and unwraps the envelope', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          status: 'online',
          checkedAt: 1,
          capabilities: {
            assetClasses: ['stock'],
            bars: { periods: ['daily'], adjustments: ['none'] },
          },
        },
        requestId: 'r',
      }),
    )

    const transport = createHttpMarketDataTransport()
    await expect(transport.probe('gotdx')).resolves.toEqual({
      status: 'online',
      checkedAt: 1,
      capabilities: {
        assetClasses: ['stock'],
        bars: { periods: ['daily'], adjustments: ['none'] },
      },
    })
    expect(fetchMock).toHaveBeenCalledWith(
      `${DEFAULT_V1_BASE_URL}/api/v1/market-data/sources/gotdx/probe`,
      expect.objectContaining({ method: 'GET' }),
    )
  })

  // 验证 sourceId 会做 URL 编码，避免特殊字符破坏路径
  it('URL-encodes the sourceId in the probe path', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { status: 'offline', checkedAt: 1 }, requestId: 'r' }),
    )

    const transport = createHttpMarketDataTransport()
    await transport.probe('my source')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${DEFAULT_V1_BASE_URL}/api/v1/market-data/sources/my%20source/probe`,
    )
  })

  // 验证目录搜索请求体携带 sourceId/keyword/limit 并返回 items
  it('searches instruments with the expected JSON body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { items: [] }, requestId: 'r' }))

    const transport = createHttpMarketDataTransport()
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

  // 验证 K 线请求体完整携带品种引用与游标分页参数
  it('fetches bars with instrument and cursor parameters', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          instrumentId: 'gotdx:stock:1:600519',
          period: 'daily',
          adjustment: 'none',
          timezone: 'Asia/Shanghai',
          olderData: 'exhausted',
          items: [],
        },
        requestId: 'r',
      }),
    )

    const transport = createHttpMarketDataTransport()
    const result = await transport.fetchBars({
      sourceId: 'gotdx',
      instrument: { id: 'gotdx:stock:1:600519', symbol: '600519', exchange: 'SH' },
      period: 'daily',
      adjustment: 'none',
      limit: 500,
      before: 2,
    })

    expect(result.items).toEqual([])
    expect(result.olderData).toBe('exhausted')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${DEFAULT_V1_BASE_URL}/api/v1/market-data/bars`)
    expect(JSON.parse(String(init?.body))).toMatchObject({
      sourceId: 'gotdx',
      period: 'daily',
      limit: 500,
      before: 2,
    })
  })

  // 验证分时请求体携带交易日
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

    const transport = createHttpMarketDataTransport()
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

  // 验证多日分时请求保留可配置 days，并使用包含截止交易日的 range endpoint
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

    const transport = createHttpMarketDataTransport()
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

  // 验证非 2xx 时优先透传错误 envelope 的 message
  it('surfaces the error envelope message on failure', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: 'UPSTREAM_UNAVAILABLE', message: 'upstream down' }, requestId: 'r' },
        502,
      ),
    )

    const transport = createHttpMarketDataTransport()
    await expect(transport.probe('gotdx')).rejects.toThrow(/upstream down/)
  })

  // 验证可流转的确定性 V1 错误原样保留为稳定的前端错误码。
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

    const transport = createHttpMarketDataTransport()
    const error = await transport.probe('gotdx').catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(KLineChartError)
    expect((error as KLineChartError).code).toBe(chartErrorCode)
  })

  // 验证非 2xx 且无错误 envelope 时使用兜底消息，并带 sourceLabel 前缀
  it('falls back to a generic message when no error envelope is present', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 500 }))

    const transport = createHttpMarketDataTransport({ sourceLabel: 'gotdx' })
    await expect(transport.probe('gotdx')).rejects.toThrow(/\[gotdx\] V1 request failed: 500/)
  })

  // 验证成功响应缺少 data 字段时判定为非法 envelope 并抛错
  it('rejects a 2xx response without a data field', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ requestId: 'r' }))

    const transport = createHttpMarketDataTransport()
    const error = await transport.probe('gotdx').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(KLineChartError)
    expect((error as KLineChartError).message).toContain('invalid V1 response envelope')
  })

  // 验证断网等原生网络异常统一包装为 FETCH_FAILED 并保留 cause
  it('wraps native network errors as FETCH_FAILED', async () => {
    const networkError = new TypeError('Failed to fetch')
    fetchMock.mockRejectedValue(networkError)

    const transport = createHttpMarketDataTransport({ sourceLabel: 'gotdx' })
    const error = await transport.probe('gotdx').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(KLineChartError)
    expect((error as KLineChartError).code).toBe('FETCH_FAILED')
    expect((error as KLineChartError).message).toContain('[gotdx] network error')
    expect((error as KLineChartError).cause).toBe(networkError)
  })

  // 验证 signal 中止统一包装为 FETCH_ABORTED，调用方可区分取消与失败
  it('wraps AbortSignal aborts as FETCH_ABORTED', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    fetchMock.mockRejectedValue(abortError)

    const transport = createHttpMarketDataTransport({ sourceLabel: 'gotdx' })
    const error = await transport.probe('gotdx').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(KLineChartError)
    expect((error as KLineChartError).code).toBe('FETCH_ABORTED')
    expect((error as KLineChartError).cause).toBe(abortError)
  })

  // 验证 baseUrl 支持静态字符串形式
  it('accepts a static base URL string', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { status: 'online', checkedAt: 1 }, requestId: 'r' }),
    )

    const transport = createHttpMarketDataTransport({ baseUrl: 'http://static.test' })
    await transport.probe('gotdx')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://static.test/api/v1/market-data/sources/gotdx/probe',
    )
  })

  // 验证 baseUrl 支持运行时动态解析地址
  it('resolves the base URL lazily through the resolver', async () => {
    // Response body 只能读取一次，多次调用需每次构造新实例
    fetchMock.mockImplementation(async () =>
      jsonResponse({ data: { status: 'online', checkedAt: 1 }, requestId: 'r' }),
    )

    let baseUrl = 'http://a.test'
    const transport = createHttpMarketDataTransport({ baseUrl: () => baseUrl })
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

  // 验证调用方传入的 fetchImpl 优先于全局 fetch 使用
  it('prefers an injected fetch implementation', async () => {
    const injected = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ data: { status: 'online', checkedAt: 1 }, requestId: 'r' }))

    const transport = createHttpMarketDataTransport({ fetchImpl: injected })
    await transport.probe('gotdx')
    expect(injected).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
