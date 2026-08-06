import { describe, expect, it } from 'vitest'

import { getRegisteredFetcher } from '../fetcherDefinitionRegistry'
import { marketDataProviderRegistry } from '../marketData/providerRegistry'
import {
  MOCK_100_SYMBOL,
  MOCK_10000_SYMBOL,
  mockDataFetcher,
  mockMarketDataProvider,
} from '../mock'
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

  // 验证本地数据源通过统一 Provider 契约报告在线状态。
  it('reports online through the MarketDataProvider probe', async () => {
    expect(marketDataProviderRegistry.get('mock')).toBe(mockMarketDataProvider)
    await expect(mockMarketDataProvider.probe()).resolves.toMatchObject({ status: 'online' })
  })

  // 验证统一目录返回稳定品种标识与仅日 K 能力。
  it('exposes instruments and daily bars through the MarketDataProvider', async () => {
    const instruments = await mockMarketDataProvider.catalog!.search({ keyword: '100', limit: 10 })

    expect(instruments).toEqual([
      expect.objectContaining({
        id: 'mock:MOCK-100',
        sourceId: 'mock',
        symbol: MOCK_100_SYMBOL,
        capabilities: { bars: { periods: ['daily'], adjustments: ['none'] } },
      }),
      expect.objectContaining({ id: 'mock:MOCK-10000', symbol: MOCK_10000_SYMBOL }),
    ])

    const series = await mockMarketDataProvider.bars!.fetch({
      instrument: instruments[0]!,
      period: 'daily',
      adjustment: 'none',
      from: new Date('2024-01-01').getTime(),
      to: new Date('2024-01-31').getTime(),
    })
    expect(series).toMatchObject({
      instrumentId: 'mock:MOCK-100',
      period: 'daily',
      adjustment: 'none',
      timezone: 'Asia/Shanghai',
      volumeUnit: 'share',
    })
    expect(series.data).toHaveLength(31)
  })
})
