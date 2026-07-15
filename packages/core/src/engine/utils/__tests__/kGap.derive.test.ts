import { describe, expect, it } from 'vitest'

import { deriveKGap, kGapFromKWidth } from '../zoom'

describe('deriveKGap', () => {
  it('uses fixed 1 physical px gap in timeshare period', () => {
    expect(deriveKGap({ kWidth: 12, dpr: 2, period: 'timeshare' })).toBe(0.5)
    expect(deriveKGap({ kWidth: 3, dpr: 1, period: 'timeshare' })).toBe(1)
  })

  it('falls back to kGapFromKWidth for discrete k-line periods', () => {
    expect(deriveKGap({ kWidth: 10, dpr: 2, period: 'daily' })).toBe(kGapFromKWidth(10, 2))
    expect(deriveKGap({ kWidth: 8, dpr: 1, period: '5min' })).toBe(kGapFromKWidth(8, 1))
  })
})
