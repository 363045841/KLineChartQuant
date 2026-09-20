/** 验证跨已启用数据源的无状态品种目录查询。 */
import { describe, expect, it, vi } from 'vitest'

import { lookupInstrumentsBySymbol, searchInstruments } from '../instrumentSearch'
import { MarketDataProviderRegistry } from '../registry'
import type { InstrumentDescriptor } from '../types'
import { createMockMarketDataProvider } from './helpers/providerTestKit'

/** 创建用于断言的最小标准品种。 */
function instrument(sourceId: string, id: string): InstrumentDescriptor {
  return {
    id,
    sourceId,
    symbol: '600519',
    name: '贵州茅台',
    assetClass: 'stock',
    exchange: 'SH',
    capabilities: {},
  }
}

describe('searchInstruments', () => {
  it('searches enabled catalog providers and preserves source-scoped identities', async () => {
    const registry = new MarketDataProviderRegistry()
    const firstSearch = vi.fn().mockResolvedValue([instrument('first', 'stock:600519')])
    const secondSearch = vi.fn().mockResolvedValue([instrument('second', 'stock:600519')])
    registry.register(createMockMarketDataProvider({ sourceId: 'first', search: firstSearch }))
    registry.register(createMockMarketDataProvider({ sourceId: 'second', search: secondSearch }))

    await expect(searchInstruments(registry, { keyword: '600519', limit: 10 })).resolves.toEqual([
      instrument('first', 'stock:600519'),
      instrument('second', 'stock:600519'),
    ])
    expect(firstSearch).toHaveBeenCalledWith({ keyword: '600519', limit: 10, signal: undefined })
    expect(secondSearch).toHaveBeenCalledWith({ keyword: '600519', limit: 10, signal: undefined })
  })

  it('limits searches to the requested enabled sources', async () => {
    const registry = new MarketDataProviderRegistry()
    const firstSearch = vi.fn().mockResolvedValue([instrument('first', 'stock:600519')])
    const secondSearch = vi.fn().mockResolvedValue([instrument('second', 'stock:600519')])
    registry.register(createMockMarketDataProvider({ sourceId: 'first', search: firstSearch }))
    registry.register(createMockMarketDataProvider({ sourceId: 'second', search: secondSearch }))

    await expect(
      searchInstruments(registry, { keyword: '600519', limit: 10, sourceIds: ['second'] }),
    ).resolves.toEqual([instrument('second', 'stock:600519')])
    expect(firstSearch).not.toHaveBeenCalled()
    expect(secondSearch).toHaveBeenCalledOnce()
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
        search: vi.fn().mockResolvedValue([instrument('second', 'stock:600519')]),
      }),
    )

    await expect(searchInstruments(registry, { keyword: '600519', limit: 10 })).resolves.toEqual([
      instrument('second', 'stock:600519'),
    ])
  })
})

describe('lookupInstrumentsBySymbol', () => {
  it('returns only normalized exact matches while preserving source-scoped results', async () => {
    const registry = new MarketDataProviderRegistry()
    const firstSearch = vi
      .fn()
      .mockResolvedValue([
        instrument('first', 'stock:600519'),
        { ...instrument('first', 'stock:600519-hk'), symbol: '600519.HK' },
      ])
    const secondSearch = vi
      .fn()
      .mockResolvedValue([{ ...instrument('second', 'stock:600519'), symbol: '600519' }])
    registry.register(createMockMarketDataProvider({ sourceId: 'first', search: firstSearch }))
    registry.register(createMockMarketDataProvider({ sourceId: 'second', search: secondSearch }))

    await expect(lookupInstrumentsBySymbol(registry, { symbol: ' 600519 ' })).resolves.toEqual([
      instrument('first', 'stock:600519'),
      instrument('second', 'stock:600519'),
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
    const firstSearch = vi.fn().mockResolvedValue([instrument('first', 'stock:600519')])
    const secondSearch = vi.fn().mockResolvedValue([instrument('second', 'stock:600519')])
    const signal = new AbortController().signal
    registry.register(createMockMarketDataProvider({ sourceId: 'first', search: firstSearch }))
    registry.register(createMockMarketDataProvider({ sourceId: 'second', search: secondSearch }))

    await expect(
      lookupInstrumentsBySymbol(registry, { symbol: '600519', sourceIds: ['second'], signal }),
    ).resolves.toEqual([instrument('second', 'stock:600519')])
    expect(firstSearch).not.toHaveBeenCalled()
    expect(secondSearch).toHaveBeenCalledWith({
      keyword: '600519',
      limit: 100,
      signal,
    })
  })
})
