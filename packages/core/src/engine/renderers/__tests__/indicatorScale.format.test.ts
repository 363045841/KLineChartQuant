import { describe, expect, it } from 'vitest'
import { formatScaleValue, resolveAdaptiveDecimals } from '../Indicator/scale/scaleFormat'

describe('resolveAdaptiveDecimals', () => {
  it('keeps the minimum decimals for wide ranges', () => {
    expect(resolveAdaptiveDecimals({ minPrice: 0, maxPrice: 80 })).toBe(2)
  })

  it('grows decimals for sub-unit ranges', () => {
    expect(resolveAdaptiveDecimals({ minPrice: -0.002, maxPrice: 0.002 })).toBe(5)
  })

  it('falls back to minimum decimals for degenerate ranges', () => {
    expect(resolveAdaptiveDecimals({ minPrice: 1, maxPrice: 1 })).toBe(2)
  })
})

describe('formatScaleValue', () => {
  it('normalizes values that round down to zero', () => {
    expect(formatScaleValue(-0.0004, 2)).toBe('0.00')
    expect(formatScaleValue(-0.001, 3)).toBe('-0.001')
  })
})
