/** 行情报价格式化：小数位、千分位、涨跌额、涨跌幅与方向的可空处理。 */

import { describe, expect, it } from 'vitest'
import type { WatchlistQuote } from '../watchlistQuote.js'
import {
  formatQuoteChange,
  formatQuotePercent,
  formatQuotePrice,
  percentDirection,
  priceDecimals,
  priceDirection,
  QUOTE_PLACEHOLDER,
} from '../watchlistQuoteFormat.js'

/** 报价夹具：只填与格式化相关的字段。 */
function quote(last: number, prevClose: number): WatchlistQuote {
  return { last, prevClose, timestamp: 0, direction: 'flat' }
}

describe('watchlist quote format', () => {
  it.each([
    [0.01, 2],
    [0.00001, 5],
    [1, 0],
    [undefined, 2],
  ])('tick=%s → %i 位小数', (tickSize, decimals) => {
    expect(priceDecimals(tickSize)).toBe(decimals)
  })

  it.each([
    { quote: quote(12.345, 12), tick: 0.01, expected: '12.35' },
    { quote: quote(1.23456, 1.2), tick: 0.00001, expected: '1.23456' },
    { quote: quote(28826.68, 28000), tick: 0.01, expected: '28,826.68' },
  ])('价格按 tick 精度与千分位格式化为 $expected', ({ quote: q, tick, expected }) => {
    expect(formatQuotePrice(q, tick)).toBe(expected)
  })

  it.each([
    { quote: quote(12.345, 12), expected: '0.35' },
    { quote: quote(11.9, 12), expected: '-0.10' },
    { quote: quote(1069.11, 0), expected: QUOTE_PLACEHOLDER },
  ])('涨跌额格式化为 $expected', ({ quote: q, expected }) => {
    expect(formatQuoteChange(q, 0.01)).toBe(expected)
  })

  it.each([
    { quote: quote(12.345, 12), expected: '2.88%' },
    { quote: quote(11.9, 12), expected: '-0.83%' },
    { quote: quote(12, 12), expected: '0.00%' },
    { quote: quote(12, 0), expected: QUOTE_PLACEHOLDER },
  ])('涨跌幅格式化为 $expected', ({ quote: q, expected }) => {
    expect(formatQuotePercent(q)).toBe(expected)
  })

  it.each([
    { quote: quote(12.345, 12), expected: 'up' },
    { quote: quote(11.9, 12), expected: 'down' },
    { quote: quote(12, 12), expected: 'flat' },
  ])('percentDirection 按前收映射为 $expected', ({ quote: q, expected }) => {
    expect(percentDirection(q)).toBe(expected)
  })

  it.each([
    [12, 13, 'up'],
    [12, 11, 'down'],
    [12, 12, 'flat'],
  ] as const)('priceDirection(%i, %i) → %s', (last, prev, expected) => {
    expect(priceDirection(last, prev)).toBe(expected)
  })
})
