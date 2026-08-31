/** 验证跨已启用数据源的无状态品种目录查询。 */
import { describe, expect, it, vi } from 'vitest'

import { lookupInstrumentsBySymbol, searchInstruments } from '../instrumentSearch'
import { MarketDataProviderRegistry } from '../registry'
import type { InstrumentDescriptor, MarketDataProvider } from '../types'

/** 创建只提供品种目录的测试 Provider。 */
function createProvider(
  sourceId: string,
  search: MarketDataProvider['catalog'] extends infer Catalog
    ? Catalog extends { search: infer Search }
      ? Search
      : never
    : never,
): MarketDataProvider {
  return {
    source: { id: sourceId, displayName: sourceId },
    probe: async () => ({ status: 'online', checkedAt: 1 }),
    catalog: { search },
  }
}

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
    registry.register(createProvider('first', firstSearch))
    registry.register(createProvider('second', secondSearch))

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
    registry.register(createProvider('first', firstSearch))
    registry.register(createProvider('second', secondSearch))

    await expect(
      searchInstruments(registry, { keyword: '600519', limit: 10, sourceIds: ['second'] }),
    ).resolves.toEqual([instrument('second', 'stock:600519')])
    expect(firstSearch).not.toHaveBeenCalled()
    expect(secondSearch).toHaveBeenCalledOnce()
  })

  it('returns available results when a source search fails', async () => {
    const registry = new MarketDataProviderRegistry()
    registry.register(createProvider('first', vi.fn().mockRejectedValue(new Error('offline'))))
    registry.register(createProvider('second', vi.fn().mockResolvedValue([instrument('second', 'stock:600519')])))

    await expect(searchInstruments(registry, { keyword: '600519', limit: 10 })).resolves.toEqual([
      instrument('second', 'stock:600519'),
    ])
  })
})

describe('lookupInstrumentsBySymbol', () => {
  it('returns only normalized exact matches while preserving source-scoped results', async () => {
    const registry = new MarketDataProviderRegistry()
    const firstSearch = vi.fn().mockResolvedValue([
      instrument('first', 'stock:600519'),
      { ...instrument('first', 'stock:600519-hk'), symbol: '600519.HK' },
    ])
    const secondSearch = vi.fn().mockResolvedValue([
      { ...instrument('second', 'stock:600519'), symbol: '600519' },
    ])
    registry.register(createProvider('first', firstSearch))
    registry.register(createProvider('second', secondSearch))

    await expect(
      lookupInstrumentsBySymbol(registry, { symbol: ' 600519 ' }),
    ).resolves.toEqual([
      instrument('first', 'stock:600519'),
      instrument('second', 'stock:600519'),
    ])
    expect(firstSearch).toHaveBeenCalledWith({ keyword: '600519', limit: 100, signal: undefined })
    expect(secondSearch).toHaveBeenCalledWith({ keyword: '600519', limit: 100, signal: undefined })
  })

  it('returns no result for a blank symbol without searching providers', async () => {
    const registry = new MarketDataProviderRegistry()
    const search = vi.fn()
    registry.register(createProvider('first', search))

    await expect(lookupInstrumentsBySymbol(registry, { symbol: '   ' })).resolves.toEqual([])
    expect(search).not.toHaveBeenCalled()
  })

  it('forwards source restrictions and cancellation to the candidate search', async () => {
    const registry = new MarketDataProviderRegistry()
    const firstSearch = vi.fn().mockResolvedValue([instrument('first', 'stock:600519')])
    const secondSearch = vi.fn().mockResolvedValue([instrument('second', 'stock:600519')])
    const signal = new AbortController().signal
    registry.register(createProvider('first', firstSearch))
    registry.register(createProvider('second', secondSearch))

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
