import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { KLineData } from '../../controllers/types'
import {
  DataFetcher,
  getRegisteredFetcher,
  getRegisteredFetcherNames,
  fetcherHasCapability,
  fetcherSupportsSearch,
  fetcherSupportsPeriod,
  clearRegisteredFetchersForTest,
} from '../legacy/fetcherDefinitionRegistry'
import { routerDataFetcher, routerSearchFetchers } from '../legacy/router'
import type { DataFetcherFn, SearchFetcherFn, SearchResult } from '../legacy/types'

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
    class TestFetcher {
      static fetcher = fetchFn
    }
    void TestFetcher

    expect(fetcherSupportsPeriod('test', 'daily')).toBe(true)
    expect(fetcherSupportsPeriod('test', 'weekly')).toBe(true)
  })

  it('fetcherSupportsPeriod returns false for unsupported period', () => {
    @DataFetcher({ name: 'test', displayName: 'Test', capabilities: ['weekly'] })
    class TestFetcher {
      static fetcher = fetchFn
    }
    void TestFetcher

    expect(fetcherSupportsPeriod('test', 'daily')).toBe(false)
    expect(fetcherSupportsPeriod('test', '5min')).toBe(false)
  })

  it('fetcherSupportsPeriod accepts wildcard * for any period', () => {
    @DataFetcher({ name: 'test', displayName: 'Test', capabilities: ['*'] })
    class TestFetcher {
      static fetcher = fetchFn
    }
    void TestFetcher

    expect(fetcherSupportsPeriod('test', 'daily')).toBe(true)
    expect(fetcherSupportsPeriod('test', '5min')).toBe(true)
    expect(fetcherSupportsPeriod('test', 'quarterly')).toBe(true)
  })

  it('fetcherSupportsPeriod returns false for empty capabilities', () => {
    @DataFetcher({ name: 'test', displayName: 'Test', capabilities: [] })
    class TestFetcher {
      static fetcher = fetchFn
    }
    void TestFetcher

    expect(fetcherSupportsPeriod('test', 'daily')).toBe(false)
  })

  it('fetcherSupportsPeriod returns false when capabilities not set', () => {
    @DataFetcher({ name: 'test', displayName: 'Test' })
    class TestFetcher {
      static fetcher = fetchFn
    }
    void TestFetcher

    expect(fetcherSupportsPeriod('test', 'daily')).toBe(false)
  })

  it('fetcherSupportsPeriod returns false for unknown source', () => {
    expect(fetcherSupportsPeriod('nonexistent', 'daily')).toBe(false)
  })

  it('clearRegisteredFetchersForTest removes all definitions', () => {
    @DataFetcher({ name: 'test', displayName: 'Test', capabilities: ['daily'] })
    class TestFetcher {
      static fetcher = fetchFn
    }
    void TestFetcher

    expect(getRegisteredFetcher('test')).toBeDefined()
    clearRegisteredFetchersForTest()
    expect(getRegisteredFetcher('test')).toBeUndefined()
  })

  it('getRegisteredFetcherNames returns registered sources', () => {
    @DataFetcher({ name: 'test-a', displayName: 'Test A', capabilities: ['daily'] })
    class TestFetcherA {
      static fetcher = fetchFn
    }
    void TestFetcherA

    @DataFetcher({ name: 'test-b', displayName: 'Test B', capabilities: ['daily'] })
    class TestFetcherB {
      static fetcher = fetchFn
    }
    void TestFetcherB

    expect(getRegisteredFetcherNames().sort()).toEqual(['test-a', 'test-b'])
  })
})

describe('routerDataFetcher capability check', () => {
  beforeEach(() => {
    clearRegisteredFetchersForTest()
    mockFetch.mockReset()
  })

  it('passes through request when period is supported', async () => {
    const data: KLineData[] = [
      { timestamp: 1000, open: 100, high: 110, low: 90, close: 105, volume: 1000 },
    ]
    mockFetch.mockResolvedValue(data)

    @DataFetcher({ name: 'test', displayName: 'Test', capabilities: ['daily'] })
    class TestFetcher {
      static fetcher = fetchFn
    }
    void TestFetcher

    const result = await routerDataFetcher('test', defaultConfig)
    expect(result).toBe(data)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('passes through request when capabilities are wildcard', async () => {
    const data: KLineData[] = [
      { timestamp: 1000, open: 100, high: 110, low: 90, close: 105, volume: 1000 },
    ]
    mockFetch.mockResolvedValue(data)

    @DataFetcher({ name: 'test', displayName: 'Test', capabilities: ['*'] })
    class TestFetcher {
      static fetcher = fetchFn
    }
    void TestFetcher

    const result = await routerDataFetcher('test', { ...defaultConfig, period: '5min' })
    expect(result).toBe(data)
  })

  it('throws when period is not in capabilities', async () => {
    @DataFetcher({ name: 'test', displayName: 'Test', capabilities: ['weekly'] })
    class TestFetcher {
      static fetcher = fetchFn
    }
    void TestFetcher

    await expect(routerDataFetcher('test', defaultConfig)).rejects.toThrow(
      /does not support period/,
    )
  })

  it('throws with error message listing supported capabilities', async () => {
    @DataFetcher({ name: 'test', displayName: 'Test', capabilities: ['weekly', 'monthly'] })
    class TestFetcher {
      static fetcher = fetchFn
    }
    void TestFetcher

    await expect(routerDataFetcher('test', { ...defaultConfig, period: '5min' })).rejects.toThrow(
      /weekly, monthly/,
    )
  })

  it('throws when capabilities is empty array', async () => {
    @DataFetcher({ name: 'test', displayName: 'Test', capabilities: [] })
    class TestFetcher {
      static fetcher = fetchFn
    }
    void TestFetcher

    await expect(routerDataFetcher('test', defaultConfig)).rejects.toThrow(
      /does not support period/,
    )
  })

  it('throws when capabilities is not set', async () => {
    @DataFetcher({ name: 'test', displayName: 'Test' })
    class TestFetcher {
      static fetcher = fetchFn
    }
    void TestFetcher

    await expect(routerDataFetcher('test', defaultConfig)).rejects.toThrow(
      /does not support period/,
    )
  })

  it('rejects unknown source with registered source list', async () => {
    @DataFetcher({ name: 'baostock', displayName: 'BaoStock', capabilities: ['*'] })
    class BaoStockStub {
      static fetcher = vi.fn<DataFetcherFn>()
    }
    void BaoStockStub

    await expect(routerDataFetcher('nonexistent', defaultConfig)).rejects.toThrow(
      /unknown source "nonexistent"/,
    )
    await expect(routerDataFetcher('nonexistent', defaultConfig)).rejects.toThrow(/baostock/)
  })
})

describe('search fetcher registry and router', () => {
  beforeEach(() => {
    clearRegisteredFetchersForTest()
  })

  it('requires both the search capability and a searcher implementation', () => {
    @DataFetcher({
      name: 'searchable',
      displayName: 'Searchable',
      capabilities: ['daily', 'search'],
    })
    class SearchableFetcher {
      static fetcher = fetchFn
      static searcher: SearchFetcherFn = async () => []
    }
    void SearchableFetcher

    @DataFetcher({ name: 'missing-capability', displayName: 'Missing capability' })
    class MissingCapabilityFetcher {
      static fetcher = fetchFn
      static searcher: SearchFetcherFn = async () => []
    }
    void MissingCapabilityFetcher

    expect(fetcherHasCapability('searchable', 'search')).toBe(true)
    expect(fetcherSupportsSearch('searchable')).toBe(true)
    expect(fetcherSupportsSearch('missing-capability')).toBe(false)
  })

  it('aggregates searchable fetchers and removes duplicate results', async () => {
    @DataFetcher({ name: 'first', displayName: 'First', capabilities: ['search'] })
    class FirstFetcher {
      static fetcher = fetchFn
      static searcher: SearchFetcherFn = async () =>
        [
          {
            symbol: '600519',
            market: 'CN',
            description: '贵州茅台',
            exchange: 'SH',
            source: 'gotdx',
            params: { market: 1 },
          },
        ] as SearchResult[]
    }
    void FirstFetcher

    @DataFetcher({ name: 'second', displayName: 'Second', capabilities: ['search'] })
    class SecondFetcher {
      static fetcher = fetchFn
      static searcher: SearchFetcherFn = async () =>
        [
          {
            symbol: '600519',
            market: 'CN',
            description: '贵州茅台',
            exchange: 'SH',
            source: 'gotdx',
            params: { market: 1 },
          },
          {
            symbol: '00700',
            market: 'HK',
            description: '腾讯控股',
            exchange: 'HK',
            source: 'gotdx',
            params: { category: 71 },
          },
        ] as SearchResult[]
    }
    void SecondFetcher

    await expect(routerSearchFetchers({ query: '股', limit: 10 })).resolves.toEqual([
      {
        symbol: '600519',
        market: 'CN',
        description: '贵州茅台',
        exchange: 'SH',
        source: 'gotdx',
        params: { market: 1 },
      },
      {
        symbol: '00700',
        market: 'HK',
        description: '腾讯控股',
        exchange: 'HK',
        source: 'gotdx',
        params: { category: 71 },
      },
    ])
  })

  it('keeps otherwise identical search results from different unified markets', async () => {
    @DataFetcher({ name: 'multi-market', displayName: 'Multi Market', capabilities: ['search'] })
    class MultiMarketFetcher {
      static fetcher = fetchFn
      static searcher: SearchFetcherFn = async () => [
        {
          symbol: '000001',
          market: 'CN',
          description: 'CN symbol',
          exchange: 'X',
          source: 'normalized',
        },
        {
          symbol: '000001',
          market: 'HK',
          description: 'HK symbol',
          exchange: 'X',
          source: 'normalized',
        },
      ]
    }
    void MultiMarketFetcher

    const results = await routerSearchFetchers({ query: '000001' })

    expect(results.map((item) => item.market)).toEqual(['CN', 'HK'])
  })

  it('returns successful results when another searcher fails', async () => {
    @DataFetcher({ name: 'failed', displayName: 'Failed', capabilities: ['search'] })
    class FailedFetcher {
      static fetcher = fetchFn
      static searcher: SearchFetcherFn = async () => Promise.reject(new Error('offline'))
    }
    void FailedFetcher

    @DataFetcher({ name: 'working', displayName: 'Working', capabilities: ['search'] })
    class WorkingFetcher {
      static fetcher = fetchFn
      static searcher: SearchFetcherFn = async () => [
        {
          symbol: '000001',
          description: '平安银行',
          exchange: 'SZ',
          source: 'gotdx',
        },
      ]
    }
    void WorkingFetcher

    await expect(routerSearchFetchers({ query: '平安' })).resolves.toHaveLength(1)
  })

  it('searches only the explicitly enabled fetchers', async () => {
    const firstSearch = vi.fn<SearchFetcherFn>().mockResolvedValue([])
    const secondSearch = vi.fn<SearchFetcherFn>().mockResolvedValue([])

    @DataFetcher({ name: 'first', displayName: 'First', capabilities: ['search'] })
    class FirstFetcher {
      static fetcher = fetchFn
      static searcher = firstSearch
    }
    void FirstFetcher

    @DataFetcher({ name: 'second', displayName: 'Second', capabilities: ['search'] })
    class SecondFetcher {
      static fetcher = fetchFn
      static searcher = secondSearch
    }
    void SecondFetcher

    await routerSearchFetchers({ query: 'test', sources: ['second'] })

    expect(firstSearch).not.toHaveBeenCalled()
    expect(secondSearch).toHaveBeenCalledWith('second', {
      query: 'test',
      sources: ['second'],
    })
  })

  it('returns no results when every search fetcher is disabled', async () => {
    await expect(routerSearchFetchers({ query: 'test', sources: [] })).resolves.toEqual([])
  })

  it('rejects when every searchable fetcher fails', async () => {
    @DataFetcher({ name: 'failed', displayName: 'Failed', capabilities: ['search'] })
    class FailedFetcher {
      static fetcher = fetchFn
      static searcher: SearchFetcherFn = async () => Promise.reject(new Error('offline'))
    }
    void FailedFetcher

    await expect(routerSearchFetchers({ query: 'test' })).rejects.toThrow(
      /all search fetchers failed/,
    )
  })

  it('rejects when no fetcher supports search', async () => {
    await expect(routerSearchFetchers({ query: 'test' })).rejects.toThrow(
      /no registered fetcher supports search/,
    )
  })
})
