/** 报价格式化：小数位、涨跌幅与方向。 */

import { describe, expect, it } from 'vitest'
import {
  formatQuoteChange,
  formatQuotePrice,
  priceDecimals,
  QUOTE_PLACEHOLDER,
  quoteDirection,
} from '../watchlistQuoteFormat.js'

/** 报价夹具：只声明用例关心的数值。 */
function quote(last: number, prevClose: number) {
  return { last, prevClose, timestamp: 0 }
}

describe('watchlist quote format', () => {
  it('derives decimals from the instrument tick size', () => {
    expect(priceDecimals(0.01)).toBe(2)
    expect(priceDecimals(0.00001)).toBe(5)
    expect(priceDecimals(1)).toBe(0)
    expect(priceDecimals(undefined)).toBe(2)
  })

  it('formats price with the instrument precision', () => {
    expect(formatQuotePrice(quote(12.345, 12), 0.01)).toBe('12.35')
    expect(formatQuotePrice(quote(1.23456, 1.2), 0.00001)).toBe('1.23456')
  })

  it('formats signed percentage change', () => {
    expect(formatQuoteChange(quote(12.345, 12))).toBe('+2.88%')
    expect(formatQuoteChange(quote(11.9, 12))).toBe('-0.83%')
    expect(formatQuoteChange(quote(12, 12))).toBe('0.00%')
  })

  it('falls back to the placeholder when the previous close is unusable', () => {
    expect(formatQuoteChange(quote(12, 0))).toBe(QUOTE_PLACEHOLDER)
    expect(quoteDirection(quote(12, 0))).toBe('flat')
  })

  it('maps direction by last against previous close', () => {
    expect(quoteDirection(quote(13, 12))).toBe('up')
    expect(quoteDirection(quote(11, 12))).toBe('down')
    expect(quoteDirection(quote(12, 12))).toBe('flat')
  })
})
