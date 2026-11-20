/** viewport 可见范围与左侧加载缓冲的契约测试。 */
import { describe, expect, it } from 'vitest'

import { getVisiblePriceRange, hasLeftDataGap } from '../viewport.js'

describe('hasLeftDataGap', () => {
  it.each([
    [799.5, 800, true],
    [0, 800, true],
    [800, 800, false],
    [810, 800, false],
  ])('scrollLeft=%s / buffer=%s → %s', (scrollLeft, buffer, expected) => {
    expect(hasLeftDataGap(scrollLeft, buffer)).toBe(expected)
  })
})

describe('getVisiblePriceRange', () => {
  const data = [
    { timestamp: 1, open: 100, high: 1000, low: 1, close: 101, volume: 1 },
    { timestamp: 2, open: 101, high: 2000, low: 2, close: 103, volume: 1 },
  ]

  it('按收盘价取线/面积范围，K 线保留 OHLC 极值', () => {
    expect(getVisiblePriceRange(data, 0, 2, true)).toEqual({ minPrice: 101, maxPrice: 103 })
    expect(getVisiblePriceRange(data, 0, 2)).toEqual({ minPrice: 1, maxPrice: 2000 })
    expect(getVisiblePriceRange(data, 2, 3, true)).toBeNull()
  })
})
