/** 收盘价形态的自动范围不受未显示的影线影响。 */
import { describe, expect, it } from 'vitest'
import { getVisiblePriceRange } from '../viewport.js'

describe('close price range', () => {
  const data = [
    { timestamp: 1, open: 100, high: 1000, low: 1, close: 101, volume: 1 },
    { timestamp: 2, open: 101, high: 2000, low: 2, close: 103, volume: 1 },
  ]
  it('fits close values for line and area while retaining OHLC ranges', () => {
    expect(getVisiblePriceRange(data, 0, 2, true)).toEqual({ minPrice: 101, maxPrice: 103 })
    expect(getVisiblePriceRange(data, 0, 2)).toEqual({ minPrice: 1, maxPrice: 2000 })
    expect(getVisiblePriceRange(data, 2, 3, true)).toBeNull()
  })
})
