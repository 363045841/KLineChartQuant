/** 验证跨已启用数据源的无状态品种目录查询。 */
import { describe, expect, it, vi } from 'vitest'

import { ERROR_CODES } from '@/errors'
import { lookupInstrumentsBySymbol, searchInstruments } from '../instrumentSearch'
import { MarketDataProviderRegistry } from '../registry'
import type { InstrumentDescriptor } from '../types'
import { createMockMarketDataProvider } from './helpers/providerTestKit'

/** 创建用于断言的最小标准品种。 */
function instrument(source: string, id: string): InstrumentDescriptor {
  return {
    id,
    source,
    symbol: '600519',
    name: '贵州茅台',
    instrumentType: 'stock',
    exchange: 'SH',
    capabilities: {},
  }
}

/** 注册两个可搜索的数据源，返回搜索替身。 */
function createRegistry() {
  const registry = new MarketDataProviderRegistry()
  const firstSearch = vi.fn().mockResolvedValue([instrument('first', 'stock:600519')])
  const secondSearch = vi.fn().mockResolvedValue([instrument('second', 'stock:600519')])
  registry.register(createMockMarketDataProvider({ source: 'first', search: firstSearch }))
  registry.register(createMockMarketDataProvider({ source: 'second', search: secondSearch }))
  return { registry, firstSearch, secondSearch }
}

describe('searchInstruments', () => {
  it('合并所有已启用源，并保留按来源隔离的身份', async () => {
    const { registry, firstSearch, secondSearch } = createRegistry()

    await expect(searchInstruments(registry, { keyword: '600519', limit: 10 })).resolves.toEqual({
      instruments: [instrument('first', 'stock:600519'), instrument('second', 'stock:600519')],
      searchedSources: ['first', 'second'],
      failedSources: [],
    })
    expect(firstSearch).toHaveBeenCalledWith({ keyword: '600519', limit: 10, signal: undefined })
    expect(secondSearch).toHaveBeenCalledWith({ keyword: '600519', limit: 10, signal: undefined })
  })

  it('只查询调用方指定的已启用源', async () => {
    const { registry, firstSearch, secondSearch } = createRegistry()

    await expect(
      searchInstruments(registry, { keyword: '600519', limit: 10, sources: ['second'] }),
    ).resolves.toEqual({
      instruments: [instrument('second', 'stock:600519')],
      searchedSources: ['second'],
      failedSources: [],
    })
    expect(firstSearch).not.toHaveBeenCalled()
    expect(secondSearch).toHaveBeenCalledOnce()
  })

  it('显式空源列表表示不查询任何源', async () => {
    const { registry, firstSearch } = createRegistry()

    await expect(
      searchInstruments(registry, { keyword: '600519', limit: 10, sources: [] }),
    ).resolves.toEqual({ instruments: [], searchedSources: [], failedSources: [] })
    expect(firstSearch).not.toHaveBeenCalled()
  })

  it('拒绝不可用的源，并列出可用的源', async () => {
    const { registry } = createRegistry()

    await expect(
      searchInstruments(registry, { keyword: '600519', limit: 10, sources: ['akshare'] }),
    ).rejects.toThrow(
      'sources akshare are unavailable for instrument lookup. Available sources: first, second. Omit sources to search every enabled source.',
    )
  })

  it('部分源失败时返回其余结果并单独汇报失败源', async () => {
    const registry = new MarketDataProviderRegistry()
    registry.register(
      createMockMarketDataProvider({
        source: 'first',
        search: vi.fn().mockRejectedValue(new Error('offline')),
      }),
    )
    registry.register(
      createMockMarketDataProvider({
        source: 'second',
        search: vi.fn().mockResolvedValue([instrument('second', 'stock:600519')]),
      }),
    )

    await expect(searchInstruments(registry, { keyword: '600519', limit: 10 })).resolves.toEqual({
      instruments: [instrument('second', 'stock:600519')],
      searchedSources: ['first', 'second'],
      failedSources: ['first'],
    })
  })

  it('全部源失败时抛出带失败源明细的取数错误', async () => {
    const registry = new MarketDataProviderRegistry()
    registry.register(
      createMockMarketDataProvider({
        source: 'first',
        search: vi.fn().mockRejectedValue(new Error('offline')),
      }),
    )
    registry.register(
      createMockMarketDataProvider({
        source: 'second',
        search: vi.fn().mockRejectedValue(new Error('offline')),
      }),
    )

    const error = await searchInstruments(registry, { keyword: '600519', limit: 10 }).catch(
      (value) => value,
    )
    expect(error.code).toBe(ERROR_CODES.FETCH_FAILED)
    expect(error.details).toEqual({
      searchedSources: ['first', 'second'],
      failedSources: ['first', 'second'],
    })
  })
})

describe('lookupInstrumentsBySymbol', () => {
  it('只返回规范化后的精确匹配，并保留按来源隔离的结果', async () => {
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
    registry.register(createMockMarketDataProvider({ source: 'first', search: firstSearch }))
    registry.register(createMockMarketDataProvider({ source: 'second', search: secondSearch }))

    await expect(lookupInstrumentsBySymbol(registry, { symbol: ' 600519 ' })).resolves.toEqual({
      instruments: [instrument('first', 'stock:600519'), instrument('second', 'stock:600519')],
      searchedSources: ['first', 'second'],
      failedSources: [],
    })
    expect(firstSearch).toHaveBeenCalledWith({ keyword: '600519', limit: 100, signal: undefined })
    expect(secondSearch).toHaveBeenCalledWith({ keyword: '600519', limit: 100, signal: undefined })
  })

  it('空白代码不触发任何查询', async () => {
    const { registry, firstSearch } = createRegistry()

    await expect(lookupInstrumentsBySymbol(registry, { symbol: '   ' })).resolves.toEqual({
      instruments: [],
      searchedSources: [],
      failedSources: [],
    })
    expect(firstSearch).not.toHaveBeenCalled()
  })

  it('把源限定与取消信号透传给候选查询', async () => {
    const { registry, firstSearch, secondSearch } = createRegistry()
    const signal = new AbortController().signal

    await expect(
      lookupInstrumentsBySymbol(registry, { symbol: '600519', sources: ['second'], signal }),
    ).resolves.toEqual({
      instruments: [instrument('second', 'stock:600519')],
      searchedSources: ['second'],
      failedSources: [],
    })
    expect(firstSearch).not.toHaveBeenCalled()
    expect(secondSearch).toHaveBeenCalledWith({ keyword: '600519', limit: 100, signal })
  })
})
