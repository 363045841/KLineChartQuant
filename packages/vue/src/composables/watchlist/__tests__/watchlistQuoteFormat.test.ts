/** 报价格式化：小数位、千分位、涨跌额、涨跌幅与相邻快照方向。 */

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

/** 报价夹具：只声明用例关心的数值。 */
function quote(last: number, prevClose: number): WatchlistQuote {
  return { last, prevClose, timestamp: 0, direction: 'flat' }
}

describe('watchlist quote format', () => {
  it('derives decimals from the instrument tick size', () => {
    expect(priceDecimals(0.01)).toBe(2)
    expect(priceDecimals(0.00001)).toBe(5)
    expect(priceDecimals(1)).toBe(0)
    expect(priceDecimals(undefined)).toBe(2)
  })

  it('formats price with the instrument precision and grouping', () => {
    expect(formatQuotePrice(quote(12.345, 12), 0.01)).toBe('12.35')
    expect(formatQuotePrice(quote(1.23456, 1.2), 0.00001)).toBe('1.23456')
    expect(formatQuotePrice(quote(28826.68, 28000), 0.01)).toBe('28,826.68')
  })

  it('formats signed change amounts in the price precision', () => {
    expect(formatQuoteChange(quote(12.345, 12), 0.01)).toBe('0.35')
    expect(formatQuoteChange(quote(11.9, 12), 0.01)).toBe('-0.10')
    expect(formatQuoteChange(quote(1069.11, 0), 0.01)).toBe(QUOTE_PLACEHOLDER)
  })

  it('formats signed percentage change without a leading plus', () => {
    expect(formatQuotePercent(quote(12.345, 12))).toBe('2.88%')
    expect(formatQuotePercent(quote(11.9, 12))).toBe('-0.83%')
    expect(formatQuotePercent(quote(12, 12))).toBe('0.00%')
  })

  it('falls back to the placeholder when the previous close is unusable', () => {
    expect(formatQuotePercent(quote(12, 0))).toBe(QUOTE_PLACEHOLDER)
  })

  it('maps percentage direction by the sign against the previous close', () => {
    expect(percentDirection(quote(12.345, 12))).toBe('up')
    expect(percentDirection(quote(11.9, 12))).toBe('down')
    expect(percentDirection(quote(12, 12))).toBe('flat')
  })

  it('maps direction by comparing two consecutive snapshots', () => {
    expect(priceDirection(12, 13)).toBe('up')
    expect(priceDirection(12, 11)).toBe('down')
    expect(priceDirection(12, 12)).toBe('flat')
  })
})
