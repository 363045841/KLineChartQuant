/** 验证跨已启用数据源的无状态品种目录查询。 */
import { describe, expect, it, vi } from 'vitest'

import { lookupInstrumentsBySymbol, searchInstruments } from '../impl/instrumentSearch'
import { MarketDataProviderRegistry } from '../impl/registry'
import type { InstrumentDescriptor } from '../types'
import { createMockMarketDataProvider } from './helpers/providerTestKit'

/** 创建用于断言的最小标准品种。 */
function instrument(sourceId: string, id: string): InstrumentDescriptor {
  return {
    id,
    sourceId,
    symbol: '600519',
    name: '贵州茅台',
    instrumentType: 'stock',
    exchange: 'SH',
    capabilities: {},
  }
}

/** 构造同一代码的 Binance 现货/永续品种。 */
function binanceInstrument(market: 'spot' | 'perp'): InstrumentDescriptor {
  return {
    id: `binance:${market}:BTCUSDT`,
    sourceId: 'binance',
    symbol: 'BTCUSDT',
    name: 'BTC/USDT',
    instrumentType: 'crypto',
    exchange: 'BINANCE',
    providerRef: { symbol: 'BTCUSDT', market },
    capabilities: {},
  }
}

describe('searchInstruments', () => {
  it('searches enabled catalog providers and preserves source-scoped identities', async () => {
    const registry = new MarketDataProviderRegistry()
    const firstSearch = vi.fn().mockResolvedValue([instrument('first', 'first:stock:600519')])
    const secondSearch = vi.fn().mockResolvedValue([instrument('second', 'second:stock:600519')])
    registry.register(createMockMarketDataProvider({ sourceId: 'first', search: firstSearch }))
    registry.register(createMockMarketDataProvider({ sourceId: 'second', search: secondSearch }))

    await expect(searchInstruments(registry, { keyword: '600519', limit: 10 })).resolves.toEqual([
      instrument('first', 'first:stock:600519'),
      instrument('second', 'second:stock:600519'),
    ])
    expect(firstSearch).toHaveBeenCalledWith({ keyword: '600519', limit: 10, signal: undefined })
    expect(secondSearch).toHaveBeenCalledWith({ keyword: '600519', limit: 10, signal: undefined })
  })

  it('limits searches to the requested enabled sources', async () => {
    const registry = new MarketDataProviderRegistry()
    const firstSearch = vi.fn().mockResolvedValue([instrument('first', 'first:stock:600519')])
    const secondSearch = vi.fn().mockResolvedValue([instrument('second', 'second:stock:600519')])
    registry.register(createMockMarketDataProvider({ sourceId: 'first', search: firstSearch }))
    registry.register(createMockMarketDataProvider({ sourceId: 'second', search: secondSearch }))

    await expect(
      searchInstruments(registry, { keyword: '600519', limit: 10, sourceIds: ['second'] }),
    ).resolves.toEqual([instrument('second', 'second:stock:600519')])
    expect(firstSearch).not.toHaveBeenCalled()
    expect(secondSearch).toHaveBeenCalledOnce()
  })

  it('treats an explicit empty source list as no searchable source', async () => {
    const registry = new MarketDataProviderRegistry()
    const search = vi.fn()
    registry.register(createMockMarketDataProvider({ sourceId: 'first', search }))

    await expect(
      searchInstruments(registry, { keyword: '600519', limit: 10, sourceIds: [] }),
    ).resolves.toEqual([])
    expect(search).not.toHaveBeenCalled()
  })

  it('rejects unavailable source IDs with the enabled catalog source IDs needed to retry', async () => {
    const registry = new MarketDataProviderRegistry()
    registry.register(createMockMarketDataProvider({ sourceId: 'first', search: vi.fn() }))
    registry.register(createMockMarketDataProvider({ sourceId: 'second', search: vi.fn() }))

    await expect(
      searchInstruments(registry, { keyword: '600519', limit: 10, sourceIds: ['akshare'] }),
    ).rejects.toThrow(
      'sourceIds akshare are unavailable for instrument lookup. Available sourceIds: first, second. Omit sourceIds to search every enabled source.',
    )
  })

  it('returns available results when a source search fails', async () => {
    const registry = new MarketDataProviderRegistry()
    registry.register(
      createMockMarketDataProvider({
        sourceId: 'first',
        search: vi.fn().mockRejectedValue(new Error('offline')),
      }),
    )
    registry.register(
      createMockMarketDataProvider({
        sourceId: 'second',
        search: vi.fn().mockResolvedValue([instrument('second', 'second:stock:600519')]),
      }),
    )

    await expect(searchInstruments(registry, { keyword: '600519', limit: 10 })).resolves.toEqual([
      instrument('second', 'second:stock:600519'),
    ])
  })
})

describe('lookupInstrumentsBySymbol', () => {
  it('returns only normalized exact matches while preserving source-scoped results', async () => {
    const registry = new MarketDataProviderRegistry()
    const firstSearch = vi
      .fn()
      .mockResolvedValue([
        instrument('first', 'first:stock:600519'),
        { ...instrument('first', 'first:stock:600519-hk'), symbol: '600519.HK' },
      ])
    const secondSearch = vi
      .fn()
      .mockResolvedValue([{ ...instrument('second', 'second:stock:600519'), symbol: '600519' }])
    registry.register(createMockMarketDataProvider({ sourceId: 'first', search: firstSearch }))
    registry.register(createMockMarketDataProvider({ sourceId: 'second', search: secondSearch }))

    await expect(lookupInstrumentsBySymbol(registry, { symbol: ' 600519 ' })).resolves.toEqual([
      instrument('first', 'first:stock:600519'),
      instrument('second', 'second:stock:600519'),
    ])
    expect(firstSearch).toHaveBeenCalledWith({ keyword: '600519', limit: 100, signal: undefined })
    expect(secondSearch).toHaveBeenCalledWith({ keyword: '600519', limit: 100, signal: undefined })
  })

  it('returns no result for a blank symbol without searching providers', async () => {
    const registry = new MarketDataProviderRegistry()
    const search = vi.fn()
    registry.register(createMockMarketDataProvider({ sourceId: 'first', search }))

    await expect(lookupInstrumentsBySymbol(registry, { symbol: '   ' })).resolves.toEqual([])
    expect(search).not.toHaveBeenCalled()
  })

  it('forwards source restrictions and cancellation to the candidate search', async () => {
    const registry = new MarketDataProviderRegistry()
    const firstSearch = vi.fn().mockResolvedValue([instrument('first', 'first:stock:600519')])
    const secondSearch = vi.fn().mockResolvedValue([instrument('second', 'second:stock:600519')])
    const signal = new AbortController().signal
    registry.register(createMockMarketDataProvider({ sourceId: 'first', search: firstSearch }))
    registry.register(createMockMarketDataProvider({ sourceId: 'second', search: secondSearch }))

    await expect(
      lookupInstrumentsBySymbol(registry, { symbol: '600519', sourceIds: ['second'], signal }),
    ).resolves.toEqual([instrument('second', 'second:stock:600519')])
    expect(firstSearch).not.toHaveBeenCalled()
    expect(secondSearch).toHaveBeenCalledWith({
      keyword: '600519',
      limit: 100,
      signal,
    })
  })
})

describe('TradingView .P 后缀', () => {
  // 验证 `.P` 在搜索入口还原为关键词与市场限定，不把后缀发给后端。
  it('搜索把 .P 还原成关键词与 perp 市场', async () => {
    const registry = new MarketDataProviderRegistry()
    const search = vi.fn().mockResolvedValue([])
    registry.register(createMockMarketDataProvider({ sourceId: 'binance', search }))

    await searchInstruments(registry, { keyword: 'BTCUSDT.P', limit: 10 })

    expect(search).toHaveBeenCalledWith({
      keyword: 'BTCUSDT',
      limit: 10,
      market: 'perp',
      signal: undefined,
    })
  })

  // 验证空白关键词不会构造任何请求。
  it('空白关键词不产生搜索请求', async () => {
    const registry = new MarketDataProviderRegistry()
    const search = vi.fn()
    registry.register(createMockMarketDataProvider({ sourceId: 'binance', search }))

    await expect(searchInstruments(registry, { keyword: '   ', limit: 10 })).resolves.toEqual([])
    expect(search).not.toHaveBeenCalled()
  })

  // 验证精确查找按展示代码比较：`BTCUSDT.P` 只命中永续，不命中同代码现货。
  it('精确查找只命中永续品种', async () => {
    const registry = new MarketDataProviderRegistry()
    const search = vi
      .fn()
      .mockResolvedValue([binanceInstrument('spot'), binanceInstrument('perp')])
    registry.register(createMockMarketDataProvider({ sourceId: 'binance', search }))

    const result = await lookupInstrumentsBySymbol(registry, { symbol: 'BTCUSDT.P' })

    expect(result.map((item) => item.id)).toEqual(['binance:perp:BTCUSDT'])
    expect(search).toHaveBeenCalledWith({
      keyword: 'BTCUSDT',
      limit: 100,
      market: 'perp',
      signal: undefined,
    })
  })

  // 验证不带后缀的代码只命中现货。
  it('精确查找不带后缀时只命中现货', async () => {
    const registry = new MarketDataProviderRegistry()
    const search = vi
      .fn()
      .mockResolvedValue([binanceInstrument('spot'), binanceInstrument('perp')])
    registry.register(createMockMarketDataProvider({ sourceId: 'binance', search }))

    const result = await lookupInstrumentsBySymbol(registry, { symbol: ' BTCUSDT ' })

    expect(result.map((item) => item.id)).toEqual(['binance:spot:BTCUSDT'])
    expect(search).toHaveBeenCalledWith({
      keyword: 'BTCUSDT',
      limit: 100,
      signal: undefined,
    })
  })
})
