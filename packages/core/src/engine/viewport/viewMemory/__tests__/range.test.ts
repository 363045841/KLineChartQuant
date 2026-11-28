/** 可见区间捕获：槽位范围 → 时间区间快照。 */
import { describe, expect, it } from 'vitest'
import { captureRange } from '../impl/range.js'

const bars = [{ timestamp: 100 }, { timestamp: 200 }, { timestamp: 300 }, { timestamp: 400 }]

describe('captureRange', () => {
  it('takes the first and last visible bar time', () => {
    expect(captureRange(bars, { start: 1, end: 3 })).toEqual({ fromTime: 200, toTime: 300 })
  })

  it('clamps the range to loaded bars', () => {
    expect(captureRange(bars, { start: -5, end: 99 })).toEqual({ fromTime: 100, toTime: 400 })
    expect(captureRange(bars, { start: 2, end: 99 })).toEqual({ fromTime: 300, toTime: 400 })
  })

  it('returns null without data', () => {
    expect(captureRange([], { start: 0, end: 1 })).toBeNull()
  })
})
