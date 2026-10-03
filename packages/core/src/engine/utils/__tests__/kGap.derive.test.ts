import { describe, expect, it } from 'vitest'

import { deriveKGap, kGapFromKWidth } from '../zoom'

describe('deriveKGap', () => {
  it.each([1, 1.25, 1.5, 2, 3])('K 线间距随宽度增加且对齐物理像素，DPR=%s', (dpr) => {
    const gaps = [2, 8, 16, 32, 50].map((width) => kGapFromKWidth(width, dpr) * dpr)
    for (let index = 0; index < gaps.length; index++) {
      expect(gaps[index]).toBeCloseTo(Math.round(gaps[index]!), 10)
      if (index > 0) expect(gaps[index]).toBeGreaterThan(gaps[index - 1]!)
    }
    expect(gaps.at(-1)).toBeGreaterThan(3)
  })

  it('uses fixed 1 physical px gap in timeshare period', () => {
    expect(deriveKGap({ kWidth: 12, dpr: 2, period: 'timeshare' })).toBe(0.5)
    expect(deriveKGap({ kWidth: 3, dpr: 1, period: 'timeshare' })).toBe(1)
  })

  it('falls back to kGapFromKWidth for discrete k-line periods', () => {
    expect(deriveKGap({ kWidth: 10, dpr: 2, period: 'daily' })).toBe(kGapFromKWidth(10, 2))
    expect(deriveKGap({ kWidth: 8, dpr: 1, period: '5min' })).toBe(kGapFromKWidth(8, 1))
  })
})
