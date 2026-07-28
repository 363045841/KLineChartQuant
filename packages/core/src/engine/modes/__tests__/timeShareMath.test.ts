import { describe, expect, it } from 'vitest'

import {
  resolveTimeShareSlotTimestamp,
  resolveTimestampSessionSlot,
  timeShareSlotCenterX,
} from '../../../foundation/utils/timeShareAxisLabels'
import {
  ASHARE_TIMESHARE_SESSION_SLOTS,
  computeTimeShareBarMetrics,
  computeTimeSharePaneLayout,
  computeTimeSharePriceRange,
  computeTimeShareTimeLabelIndices,
  computeTimeShareXLayout,
  resolveTimeShareSessionSlots,
  resolveTimeShareBaseline,
} from '../timeShareMath'

describe('resolveTimeShareBaseline', () => {
  it('prefers finite non-zero preClose over first trade price', () => {
    expect(resolveTimeShareBaseline({ preClose: 10.5, firstPrice: 11 })).toBe(10.5)
  })

  it('does not treat the first trade as the pre-close baseline', () => {
    expect(resolveTimeShareBaseline({ preClose: 0, firstPrice: 11 })).toBeNull()
    expect(resolveTimeShareBaseline({ firstPrice: 11 })).toBeNull()
    expect(resolveTimeShareBaseline({ preClose: null, firstPrice: 9 })).toBeNull()
  })

  it('returns null when no valid baseline exists', () => {
    expect(resolveTimeShareBaseline({ preClose: 0, firstPrice: 0 })).toBeNull()
    expect(resolveTimeShareBaseline({})).toBeNull()
    expect(resolveTimeShareBaseline({ preClose: NaN, firstPrice: Infinity })).toBeNull()
  })
})

describe('computeTimeSharePriceRange', () => {
  it('uses preClose baseline and pads around max absolute percent move', () => {
    // open gap up: first trade 11, preClose 10 → +10%; later 10.5 → 5%
    const range = computeTimeSharePriceRange([11, 10.5, 10.2], 10)
    expect(range).not.toBeNull()
    // maxAbsPct=10, padding=max(1, 0.5)=1 → display 11%
    expect(range!.maxPrice).toBeCloseTo(10 * 1.11, 8)
    expect(range!.minPrice).toBeCloseTo(10 * 0.89, 8)
  })

  it('still applies minimum padding when all prices equal baseline (flat day)', () => {
    const range = computeTimeSharePriceRange([10, 10, 10], 10)
    expect(range).not.toBeNull()
    // maxAbsPct=0, padding=min 0.5% → ±0.5%
    expect(range!.maxPrice).toBeCloseTo(10.05, 8)
    expect(range!.minPrice).toBeCloseTo(9.95, 8)
  })

  it('returns null for invalid baseline', () => {
    expect(computeTimeSharePriceRange([10], 0)).toBeNull()
    expect(computeTimeSharePriceRange([10], NaN)).toBeNull()
  })
})

describe('resolveTimeShareSessionSlots', () => {
  it('defaults to A-share 240 one-minute slots (sessions SSOT)', () => {
    expect(ASHARE_TIMESHARE_SESSION_SLOTS).toBe(240)
    expect(resolveTimeShareSessionSlots(0)).toBe(240)
    expect(resolveTimeShareSessionSlots(60)).toBe(240)
  })

  it('does not expand when arrived points exceed session slots', () => {
    expect(resolveTimeShareSessionSlots(300)).toBe(240)
  })
})

describe('computeTimeShareBarMetrics', () => {
  it('divides viewWidth by full session slots, not arrived point count', () => {
    // 盘中仅 60 点：宽度仍按 240 槽划分，不把 60 点拉满屏
    const partial = computeTimeShareBarMetrics(60, 320, 1)
    const full = computeTimeShareBarMetrics(240, 320, 1)
    expect(partial).not.toBeNull()
    expect(full).not.toBeNull()
    expect(partial!.kWidth).toBeCloseTo(full!.kWidth, 8)
    expect(partial!.kGap).toBeCloseTo(full!.kGap, 8)
    expect((partial!.kWidth + partial!.kGap) * 240).toBeCloseTo(320, 6)
  })

  it('fits full session into viewWidth even when per-bar width is sub-pixel (DPR=1 narrow)', () => {
    const m = computeTimeShareBarMetrics(240, 320, 1)
    expect(m).not.toBeNull()
    const unit = m!.kWidth + m!.kGap
    expect(unit * 240).toBeCloseTo(320, 6)
    expect(m!.kWidth).toBeGreaterThan(0)
    expect(m!.kGap).toBeGreaterThanOrEqual(0)
  })

  it('keeps full session visible at high DPR', () => {
    const m = computeTimeShareBarMetrics(240, 320, 2)
    expect(m).not.toBeNull()
    expect((m!.kWidth + m!.kGap) * 240).toBeCloseTo(320, 6)
  })

  it('returns null for empty data or invalid width', () => {
    expect(computeTimeShareBarMetrics(0, 320, 1)).toBeNull()
    expect(computeTimeShareBarMetrics(10, 0, 1)).toBeNull()
  })
})

describe('computeTimeShareXLayout', () => {
  it('places partial-day points on session timeline leaving right-side blank', () => {
    const layout = computeTimeShareXLayout({
      arrivedCount: 60,
      sessionSlots: 240,
      totalWidth: 480,
      dpr: 1,
    })
    expect(layout).not.toBeNull()
    // step = 480/240 = 2；第 0 点中心 1，第 59 点中心 119，未到右缘 480
    expect(layout!.centers[0]).toBeCloseTo(1, 6)
    expect(layout!.centers[59]).toBeCloseTo(119, 6)
    expect(layout!.centers[59]!).toBeLessThan(480 * 0.3)
    expect(layout!.step).toBeCloseTo(2, 6)
  })

  it('fills full width only when arrivedCount covers full session', () => {
    const layout = computeTimeShareXLayout({
      arrivedCount: 240,
      sessionSlots: 240,
      totalWidth: 480,
      dpr: 1,
    })
    expect(layout).not.toBeNull()
    expect(layout!.centers[0]).toBeCloseTo(1, 6)
    expect(layout!.centers[239]).toBeCloseTo(479, 6)
  })

  it('uses supplied session slots instead of compacting across lunch', () => {
    const layout = computeTimeShareXLayout({
      arrivedCount: 4,
      sessionSlots: 240,
      totalWidth: 480,
      dpr: 1,
      slotIndices: [0, 119, 121, 239],
    })

    expect(layout).not.toBeNull()
    expect(layout!.centers).toEqual([1, 239, 243, 479])
  })
})

describe('computeTimeSharePaneLayout', () => {
  it('splits price area above volume area without overlap', () => {
    const layout = computeTimeSharePaneLayout(400, 0.25)
    expect(layout.priceAreaHeight).toBe(300)
    expect(layout.volumeAreaHeight).toBe(100)
    expect(layout.priceTop).toBe(0)
    expect(layout.volumeTop).toBe(300)
    expect(layout.priceTop + layout.priceAreaHeight).toBe(layout.volumeTop)
  })
})

describe('computeTimeShareTimeLabelIndices', () => {
  it('only session closed-side endpoints: 9:30 / 13:00 / 15:00', () => {
    const labels = computeTimeShareTimeLabelIndices({
      axisWidth: 800,
      sessionSlots: 240,
    })
    // 9:30 → 0；13:00 → 120；15:00 → 239
    expect(labels).toEqual([0, 120, 239])
  })

  it('returns empty for invalid axis width', () => {
    expect(
      computeTimeShareTimeLabelIndices({
        axisWidth: 0,
        sessionSlots: 240,
      }),
    ).toEqual([])
  })
})

describe('timeShare slot time/x helpers', () => {
  it('maps gotdx closing timestamps without compacting the lunch break', () => {
    const time = (hour: number, minute: number) => Date.UTC(2026, 6, 28, hour - 8, minute)

    expect(resolveTimestampSessionSlot(time(9, 30))).toBe(0)
    expect(resolveTimestampSessionSlot(time(11, 30))).toBe(119)
    expect(resolveTimestampSessionSlot(time(13, 1))).toBe(121)
    expect(resolveTimestampSessionSlot(time(15, 0))).toBe(239)
    expect(resolveTimestampSessionSlot(1e100)).toBeNull()
  })

  it('maps A-share slots across lunch break', () => {
    // 2026-07-21 local
    const day = new Date(2026, 6, 21, 10, 0, 0, 0).getTime()
    expect(new Date(resolveTimeShareSlotTimestamp(day, 0)).getHours()).toBe(9)
    expect(new Date(resolveTimeShareSlotTimestamp(day, 0)).getMinutes()).toBe(30)
    // slot 120 = 13:00
    expect(new Date(resolveTimeShareSlotTimestamp(day, 120)).getHours()).toBe(13)
    expect(new Date(resolveTimeShareSlotTimestamp(day, 120)).getMinutes()).toBe(0)
    // slot 239 = 14:59
    expect(new Date(resolveTimeShareSlotTimestamp(day, 239)).getHours()).toBe(14)
    expect(new Date(resolveTimeShareSlotTimestamp(day, 239)).getMinutes()).toBe(59)
  })

  it('places last session slot near right edge of axis', () => {
    const x0 = timeShareSlotCenterX(0, 480, 240, 1)
    const xLast = timeShareSlotCenterX(239, 480, 240, 1)
    expect(x0).toBeCloseTo(1, 6)
    expect(xLast).toBeCloseTo(479, 6)
  })
})
