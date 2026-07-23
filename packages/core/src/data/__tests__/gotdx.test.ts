import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import '../gotdx'
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
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
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

  it('uses and normalizes VITE_GOTDX_API_BASE_URL', async () => {
    vi.stubEnv('VITE_GOTDX_API_BASE_URL', 'http://gotdx.test:9090///')
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

  it('wraps search HTTP failures', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'offline' }, 503))
    const definition = getRegisteredFetcher('gotdx')

    await expect(definition?.searcher?.('gotdx', { query: 'test' })).rejects.toThrow(
      /symbol search failed: 503/,
    )
  })
})
