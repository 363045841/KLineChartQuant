import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  DataFetcher,
  getRegisteredFetcher,
  fetcherSupportsPeriod,
  clearRegisteredFetchersForTest,
} from '../fetcherDefinitionRegistry'
import { routerDataFetcher } from '../router'
import type { DataFetcherFn } from '../types'
import type { KLineData } from '../../controllers/types'

const mockFetch = vi.fn<() => Promise<ReadonlyArray<KLineData>>>()

const fetchFn: DataFetcherFn = async () => mockFetch()

const defaultConfig = {
  symbol: '000001',
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  period: 'daily',
  adjust: 'none',
}

describe('DataFetcher registry', () => {
  beforeEach(() => {
    clearRegisteredFetchersForTest()
  })

  it('collects decorated fetcher definition with metadata', () => {
    @DataFetcher({
      name: 'test',
      displayName: 'Test',
      version: '1.0.0',
      capabilities: ['daily', 'weekly'],
    })
    class TestFetcher {
      static fetcher = fetchFn
    }
    void TestFetcher

    const def = getRegisteredFetcher('test')
    expect(def).toBeDefined()
    expect(def!.name).toBe('test')
    expect(def!.displayName).toBe('Test')
    expect(def!.version).toBe('1.0.0')
    expect(def!.capabilities).toEqual(['daily', 'weekly'])
    expect(def!.fetcher).toBe(fetchFn)
  })

  it('fetcherSupportsPeriod returns true for exact match', () => {
    @DataFetcher({ name: 'test', displayName: 'Test', capabilities: ['daily', 'weekly'] })
    class TestFetcher { static fetcher = fetchFn }
    void TestFetcher

    expect(fetcherSupportsPeriod('test', 'daily')).toBe(true)
    expect(fetcherSupportsPeriod('test', 'weekly')).toBe(true)
  })

  it('fetcherSupportsPeriod returns false for unsupported period', () => {
    @DataFetcher({ name: 'test', displayName: 'Test', capabilities: ['weekly'] })
    class TestFetcher { static fetcher = fetchFn }
    void TestFetcher

    expect(fetcherSupportsPeriod('test', 'daily')).toBe(false)
    expect(fetcherSupportsPeriod('test', '5min')).toBe(false)
  })

  it('fetcherSupportsPeriod accepts wildcard * for any period', () => {
    @DataFetcher({ name: 'test', displayName: 'Test', capabilities: ['*'] })
    class TestFetcher { static fetcher = fetchFn }
    void TestFetcher

    expect(fetcherSupportsPeriod('test', 'daily')).toBe(true)
    expect(fetcherSupportsPeriod('test', '5min')).toBe(true)
    expect(fetcherSupportsPeriod('test', 'quarterly')).toBe(true)
  })

  it('fetcherSupportsPeriod returns false for empty capabilities', () => {
    @DataFetcher({ name: 'test', displayName: 'Test', capabilities: [] })
    class TestFetcher { static fetcher = fetchFn }
    void TestFetcher

    expect(fetcherSupportsPeriod('test', 'daily')).toBe(false)
  })

  it('fetcherSupportsPeriod returns false when capabilities not set', () => {
    @DataFetcher({ name: 'test', displayName: 'Test' })
    class TestFetcher { static fetcher = fetchFn }
    void TestFetcher

    expect(fetcherSupportsPeriod('test', 'daily')).toBe(false)
  })

  it('fetcherSupportsPeriod returns false for unknown source', () => {
    expect(fetcherSupportsPeriod('nonexistent', 'daily')).toBe(false)
  })

  it('clearRegisteredFetchersForTest removes all definitions', () => {
    @DataFetcher({ name: 'test', displayName: 'Test', capabilities: ['daily'] })
    class TestFetcher { static fetcher = fetchFn }
    void TestFetcher

    expect(getRegisteredFetcher('test')).toBeDefined()
    clearRegisteredFetchersForTest()
    expect(getRegisteredFetcher('test')).toBeUndefined()
  })
})

describe('routerDataFetcher capability check', () => {
  beforeEach(() => {
    clearRegisteredFetchersForTest()
    mockFetch.mockReset()
  })

  it('passes through request when period is supported', async () => {
    const data: KLineData[] = [{ timestamp: 1000, open: 100, high: 110, low: 90, close: 105, volume: 1000 }]
    mockFetch.mockResolvedValue(data)

    @DataFetcher({ name: 'test', displayName: 'Test', capabilities: ['daily'] })
    class TestFetcher { static fetcher = fetchFn }
    void TestFetcher

    const result = await routerDataFetcher('test', defaultConfig)
    expect(result).toBe(data)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('passes through request when capabilities are wildcard', async () => {
    const data: KLineData[] = [{ timestamp: 1000, open: 100, high: 110, low: 90, close: 105, volume: 1000 }]
    mockFetch.mockResolvedValue(data)

    @DataFetcher({ name: 'test', displayName: 'Test', capabilities: ['*'] })
    class TestFetcher { static fetcher = fetchFn }
    void TestFetcher

    const result = await routerDataFetcher('test', { ...defaultConfig, period: '5min' })
    expect(result).toBe(data)
  })

  it('throws when period is not in capabilities', async () => {
    @DataFetcher({ name: 'test', displayName: 'Test', capabilities: ['weekly'] })
    class TestFetcher { static fetcher = fetchFn }
    void TestFetcher

    await expect(
      routerDataFetcher('test', defaultConfig),
    ).rejects.toThrow(/does not support period/)
  })

  it('throws with error message listing supported capabilities', async () => {
    @DataFetcher({ name: 'test', displayName: 'Test', capabilities: ['weekly', 'monthly'] })
    class TestFetcher { static fetcher = fetchFn }
    void TestFetcher

    await expect(
      routerDataFetcher('test', { ...defaultConfig, period: '5min' }),
    ).rejects.toThrow(/weekly, monthly/)
  })

  it('throws when capabilities is empty array', async () => {
    @DataFetcher({ name: 'test', displayName: 'Test', capabilities: [] })
    class TestFetcher { static fetcher = fetchFn }
    void TestFetcher

    await expect(
      routerDataFetcher('test', defaultConfig),
    ).rejects.toThrow(/does not support period/)
  })

  it('throws when capabilities is not set', async () => {
    @DataFetcher({ name: 'test', displayName: 'Test' })
    class TestFetcher { static fetcher = fetchFn }
    void TestFetcher

    await expect(
      routerDataFetcher('test', defaultConfig),
    ).rejects.toThrow(/does not support period/)
  })

  it('falls back to registered baostock for unknown source', async () => {
    const data: KLineData[] = [{ timestamp: 2000, open: 200, high: 210, low: 190, close: 205, volume: 2000 }]
    const baostockFn = vi.fn<DataFetcherFn>().mockResolvedValue(data)

    @DataFetcher({ name: 'baostock', displayName: 'BaoStock', capabilities: ['*'] })
    class BaoStockStub { static fetcher = baostockFn }
    void BaoStockStub

    const result = await routerDataFetcher('nonexistent', defaultConfig)
    expect(result).toBe(data)
    expect(baostockFn).toHaveBeenCalledWith('nonexistent', expect.objectContaining({ period: 'daily' }))
  })
})
