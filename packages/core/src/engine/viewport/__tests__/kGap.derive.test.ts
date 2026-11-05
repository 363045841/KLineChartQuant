/** 连续槽位间隙与分时固定物理像素间隙的派生契约。 */
import { describe, expect, it } from 'vitest'

import { deriveKGap, kGapFromKWidth } from '../zoom'

describe('deriveKGap', () => {
  it.each([1, 1.25, 1.5, 2, 3])('K 线间距连续增长且至少一个物理像素，DPR=%s', (dpr) => {
    const gaps = [2, 8, 16, 32, 50].map((width) => kGapFromKWidth(width, dpr) * dpr)
    for (let index = 0; index < gaps.length; index++) {
      expect(gaps[index]).toBeGreaterThanOrEqual(1)
      if (index > 0) expect(gaps[index]).toBeGreaterThan(gaps[index - 1]!)
    }
    expect(gaps.at(-1)).toBeGreaterThan(3)
    expect(kGapFromKWidth(8.001, dpr) - kGapFromKWidth(8, dpr)).toBeCloseTo(0.0006, 10)
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
