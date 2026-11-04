/** 自选分组投影：数据源顺序、品种类型顺序与未知来源兜底。 */

import { makeSearchableSymbol, TEST_SYMBOLS } from '@vue-src/composables/__tests__/testSymbols.js'
import { describe, expect, it } from 'vitest'
import { groupWatchlist } from '../useWatchlistGroups.js'

/** 目录顺序即数据源分组顺序。 */
const SOURCE_LABELS = new Map([
  ['tradingview', 'TradingView'],
  ['gotdx', 'GOTDX'],
])

describe('groupWatchlist', () => {
  it('orders source groups by catalog order and keeps item order', () => {
    const groups = groupWatchlist(TEST_SYMBOLS, 'source', SOURCE_LABELS)

    expect(
      groups.map((group) => [group.key, group.label, group.items.map((item) => item.symbol)]),
    ).toEqual([
      ['tradingview', 'TradingView', ['AAPL']],
      ['gotdx', 'GOTDX', ['600519']],
    ])
  })

  it('keeps sources missing from the catalog under their id', () => {
    const item = makeSearchableSymbol({ id: 'ths:1', sourceId: 'ths', symbol: '600000' })

    const groups = groupWatchlist([...TEST_SYMBOLS, item], 'source', SOURCE_LABELS)

    expect(groups.at(-1)).toMatchObject({ key: 'ths', label: 'ths', items: [item] })
  })

  it('orders instrument types by the declared order', () => {
    const crypto = makeSearchableSymbol({
      id: 'binance:spot:BTCUSDT',
      sourceId: 'binance',
      symbol: 'BTCUSDT',
      instrumentType: 'crypto',
    })

    const groups = groupWatchlist([crypto, ...TEST_SYMBOLS], 'instrumentType', SOURCE_LABELS)

    expect(groups.map((group) => group.label)).toEqual(['股票', '加密货币'])
    expect(groups[0]!.items).toEqual(TEST_SYMBOLS)
    expect(groups[1]!.items).toEqual([crypto])
  })

  it('returns no group for an empty watchlist', () => {
    expect(groupWatchlist([], 'source', SOURCE_LABELS)).toEqual([])
    expect(groupWatchlist([], 'instrumentType', SOURCE_LABELS)).toEqual([])
  })
})
