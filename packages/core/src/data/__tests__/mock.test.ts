import { describe, expect, it } from 'vitest'

import { getRegisteredFetcher } from '../fetcherDefinitionRegistry'
import { MOCK_100_SYMBOL, MOCK_10000_SYMBOL, mockDataFetcher } from '../mock'
import { routerDataFetcher, routerSearchFetchers } from '../router'

const defaultConfig = {
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  period: 'daily',
  adjust: 'none',
}

describe('mock data source', () => {
  it('registers a single searchable mock source', () => {
    const def = getRegisteredFetcher('mock')
    expect(def).toBeDefined()
    expect(def!.name).toBe('mock')
    expect(def!.displayName).toBe('Mock')
    expect(def!.capabilities).toContain('search')
    expect(typeof def!.searcher).toBe('function')
    expect(def!.fetcher).toBe(mockDataFetcher)
  })

  it('search returns the MOCK-100 and MOCK-10000 varieties', async () => {
    const results = await routerSearchFetchers({ query: 'mock' })
    expect(results.map((result) => result.symbol)).toEqual([MOCK_100_SYMBOL, MOCK_10000_SYMBOL])
  })

  it('search respects limit', async () => {
    const results = await routerSearchFetchers({ query: '', limit: 1 })
    expect(results).toHaveLength(1)
  })

  it('MOCK-10000 fetches exactly 10000 bars regardless of date range', async () => {
    const data = await routerDataFetcher('mock', {
      ...defaultConfig,
      symbol: MOCK_10000_SYMBOL,
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    })
    expect(data).toHaveLength(10000)
  })

  it('MOCK-100 fetches one bar per day within the requested date range', async () => {
    const data = await routerDataFetcher('mock', {
      ...defaultConfig,
      symbol: MOCK_100_SYMBOL,
      startDate: '2024-01-01',
      endDate: '2024-03-31',
    })
    // 2024 为闰年，1-3 月共 91 天
    expect(data).toHaveLength(91)
  })

  it('MOCK-100 returns empty when date range is invalid', async () => {
    const data = await routerDataFetcher('mock', {
      ...defaultConfig,
      symbol: MOCK_100_SYMBOL,
      startDate: '2024-02-01',
      endDate: '2024-01-01',
    })
    expect(data).toEqual([])
  })
})
