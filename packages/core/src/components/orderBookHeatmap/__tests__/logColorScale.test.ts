import { describe, expect, it } from 'vitest'

import { createLogColorScale } from '../logColorScale'

describe('createLogColorScale', () => {
  it('maps size = 0 to intensity 0', () => {
    const scale = createLogColorScale(1, 1000)
    expect(scale.intensity(0)).toBe(0)
    expect(scale.intensity(-5)).toBe(0)
  })

  it('maps size below sizeMin to 0', () => {
    const scale = createLogColorScale(10, 1000)
    expect(scale.intensity(1)).toBe(0)
    expect(scale.intensity(10)).toBe(0)
  })

  it('maps size above sizeMax to 1', () => {
    const scale = createLogColorScale(1, 100)
    expect(scale.intensity(100)).toBe(1)
    expect(scale.intensity(1_000_000)).toBe(1)
  })

  it('mid-range is monotonically increasing in log size', () => {
    const scale = createLogColorScale(1, 10_000)
    const a = scale.intensity(2)
    const b = scale.intensity(20)
    const c = scale.intensity(200)
    const d = scale.intensity(2_000)
    expect(a).toBeGreaterThan(0)
    expect(a).toBeLessThan(b)
    expect(b).toBeLessThan(c)
    expect(c).toBeLessThan(d)
    expect(d).toBeLessThan(1)
  })

  it('matches the exact log-ratio formula for a known interior point', () => {
    // sizeMin = 1, sizeMax = 100 → log range = ln(100). At size = 10
    // intensity should be ln(10) / ln(100) = 0.5.
    const scale = createLogColorScale(1, 100)
    expect(scale.intensity(10)).toBeCloseTo(0.5, 10)
  })

  it('degenerate range (sizeMin === sizeMax) returns 0.5 for any positive size', () => {
    const scale = createLogColorScale(5, 5)
    expect(scale.intensity(1)).toBe(0.5)
    expect(scale.intensity(5)).toBe(0.5)
    expect(scale.intensity(1_000_000)).toBe(0.5)
    // Non-positive sizes still map to 0.
    expect(scale.intensity(0)).toBe(0)
  })

  it('setRange swaps the range without rebuilding the scale', () => {
    const scale = createLogColorScale(1, 100)
    expect(scale.intensity(10)).toBeCloseTo(0.5, 10)
    scale.setRange(1, 1_000_000)
    // Now ln(10) / ln(1e6) = 1 / 6.
    expect(scale.intensity(10)).toBeCloseTo(1 / 6, 6)
    expect(scale.range()).toEqual({ sizeMin: 1, sizeMax: 1_000_000 })
  })

  it('rejects invalid ranges at construction', () => {
    expect(() => createLogColorScale(0, 1)).toThrow()
    expect(() => createLogColorScale(1, 0)).toThrow()
    expect(() => createLogColorScale(-1, 1)).toThrow()
    expect(() => createLogColorScale(10, 1)).toThrow()
    expect(() => createLogColorScale(Infinity, 1)).toThrow()
  })
})
