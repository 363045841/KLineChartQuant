import { describe, it, expect } from 'vitest'

import {
  barIndexToTimestamp,
  timestampToBarIndex,
  inferBarIntervalMs,
  type BarCalendar,
} from '../timeline'

// 1-minute bars covering 10 bars starting at an arbitrary epoch.
const MINUTE_MS = 60_000
const T0 = 1_700_000_000_000
function uniformCalendar(n: number, intervalMs = MINUTE_MS): BarCalendar {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(T0 + i * intervalMs)
  return out
}

describe('timeline', () => {
  describe('barIndexToTimestamp + timestampToBarIndex', () => {
    it('round-trips on a uniform calendar', () => {
      const cal = uniformCalendar(10)
      for (let i = 0; i < cal.length; i++) {
        const ts = barIndexToTimestamp(cal, i)
        expect(ts).not.toBeNull()
        const back = timestampToBarIndex(cal, ts as number)
        expect(back).toBe(i)
      }
    })

    it('returns null for out-of-range bar indices', () => {
      const cal = uniformCalendar(5)
      expect(barIndexToTimestamp(cal, -1)).toBeNull()
      expect(barIndexToTimestamp(cal, 5)).toBeNull()
      expect(barIndexToTimestamp(cal, 999)).toBeNull()
      expect(barIndexToTimestamp(cal, Number.NaN)).toBeNull()
    })

    it('returns null for empty calendars on both directions', () => {
      const empty: BarCalendar = []
      expect(barIndexToTimestamp(empty, 0)).toBeNull()
      expect(timestampToBarIndex(empty, T0)).toBeNull()
    })

    it('honors non-uniform gaps (e.g. weekend close)', () => {
      // Friday 16:00 close, then Monday 09:30 open — a ~65h gap.
      // bars 0..3 are 1-minute Friday afternoon; bar 4 is Monday open.
      const friday = T0
      const cal: BarCalendar = [
        friday + 0 * MINUTE_MS,
        friday + 1 * MINUTE_MS,
        friday + 2 * MINUTE_MS,
        friday + 3 * MINUTE_MS,
        friday + (65 * 60 + 30) * MINUTE_MS, // ~65.5h later
      ]

      // Sanity: bar 4 timestamp matches what we put in.
      expect(barIndexToTimestamp(cal, 4)).toBe(cal[4])
      // A timestamp inside the weekend gap resolves to the last
      // pre-gap bar (Friday's close), not the Monday open.
      const insideGap = (cal[3] as number) + 12 * 60 * MINUTE_MS // Saturday noon
      expect(timestampToBarIndex(cal, insideGap)).toBe(3)
      // A timestamp at or after the Monday open resolves to bar 4.
      expect(timestampToBarIndex(cal, cal[4] as number)).toBe(4)
      expect(timestampToBarIndex(cal, (cal[4] as number) + MINUTE_MS)).toBe(4)
    })

    it('clamps timestamps below the first bar to null and above the last bar to the final index', () => {
      const cal = uniformCalendar(5)
      expect(timestampToBarIndex(cal, (cal[0] as number) - 1)).toBeNull()
      expect(timestampToBarIndex(cal, (cal[4] as number) + 999_999)).toBe(4)
    })
  })

  describe('inferBarIntervalMs', () => {
    it('returns the dominant interval on a uniform calendar', () => {
      expect(inferBarIntervalMs(uniformCalendar(10))).toBe(MINUTE_MS)
    })

    it('uses the median so outlier gaps do not skew the estimate', () => {
      // Mostly 1-minute, with one massive weekend gap.
      const cal: BarCalendar = [
        0,
        MINUTE_MS,
        2 * MINUTE_MS,
        3 * MINUTE_MS,
        // 3-day gap
        3 * MINUTE_MS + 3 * 24 * 60 * MINUTE_MS,
        3 * MINUTE_MS + 3 * 24 * 60 * MINUTE_MS + MINUTE_MS,
        3 * MINUTE_MS + 3 * 24 * 60 * MINUTE_MS + 2 * MINUTE_MS,
      ]
      expect(inferBarIntervalMs(cal)).toBe(MINUTE_MS)
    })

    it('returns null when the calendar has fewer than two bars', () => {
      expect(inferBarIntervalMs([])).toBeNull()
      expect(inferBarIntervalMs([T0])).toBeNull()
    })
  })
})
