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
  computeTimeShareVisibleRange,
  computeTimeShareXLayout,
  resolveFiveDayTimeShareBaseline,
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

describe('resolveFiveDayTimeShareBaseline', () => {
  it('uses only the first trading day preClose for the entire window', () => {
    expect(
      resolveFiveDayTimeShareBaseline({
        instrumentId: 'test',
        timezone: 'Asia/Shanghai',
        requestedDays: 2,
        olderData: 'exhausted',
        days: [
          { tradingDate: '2026-08-14', preClose: 10, data: [] },
          { tradingDate: '2026-08-17', preClose: 12, data: [] },
        ],
      }),
    ).toBe(10)
  })

  it('does not replace a missing first-day preClose with a later day value', () => {
    expect(
      resolveFiveDayTimeShareBaseline({
        instrumentId: 'test',
        timezone: 'Asia/Shanghai',
        requestedDays: 2,
        olderData: 'exhausted',
        days: [
          { tradingDate: '2026-08-14', preClose: null, data: [] },
          { tradingDate: '2026-08-17', preClose: 12, data: [] },
        ],
      }),
    ).toBeNull()
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
  it('uses the same full-session integer grid for partial and full data', () => {
    // 盘中仅 60 点：宽度仍按 240 槽计算，不把 60 点拉满屏。
    const partial = computeTimeShareBarMetrics(60, 320, 1)
    const full = computeTimeShareBarMetrics(240, 320, 1)
    expect(partial).not.toBeNull()
    expect(full).not.toBeNull()
    expect(partial!.kWidth).toBeCloseTo(full!.kWidth, 8)
    expect(partial!.kGap).toBeCloseTo(full!.kGap, 8)
    expect((partial!.kWidth + partial!.kGap) * 240).toBeLessThanOrEqual(320)
  })

  it('keeps a constant one-pixel unit and puts remainder into margins at DPR=1', () => {
    const m = computeTimeShareBarMetrics(240, 320, 1)
    expect(m).not.toBeNull()
    const unit = m!.kWidth + m!.kGap
    expect(unit).toBe(1)
    expect(unit * 240).toBe(240)
  })

  it('keeps width and gap as integer physical pixels at high DPR', () => {
    const m = computeTimeShareBarMetrics(240, 320, 2)
    expect(m).not.toBeNull()
    expect(m!.kWidth * 2).toBe(1)
    expect(m!.kGap * 2).toBe(1)
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

  it('uses the main-chart physical width algorithm for volume bars', () => {
    const layout = computeTimeShareXLayout({
      arrivedCount: 1,
      sessionSlots: 24,
      totalWidth: 240,
      dpr: 1,
    })

    expect(layout).not.toBeNull()
    expect(layout!.centers[0]).toBe(5)
    expect(layout!.barWidth).toBe(9)
  })

  it('keeps center distance and volume gap constant on non-divisible widths', () => {
    const layout = computeTimeShareXLayout({
      arrivedCount: 3,
      sessionSlots: 240,
      totalWidth: 600,
      dpr: 1,
      slotIndices: [0, 1, 2],
    })

    expect(layout).not.toBeNull()
    expect(layout!.centers).toEqual([61, 63, 65])
    expect(layout!.barWidth).toBe(1)
    expect(layout!.centers[1]! - layout!.centers[0]! - layout!.barWidth).toBe(1)
    expect(layout!.centers[2]! - layout!.centers[1]! - layout!.barWidth).toBe(1)
  })

  it('keeps only the latest bar when endpoint timestamps share one slot', () => {
    const layout = computeTimeShareXLayout({
      arrivedCount: 4,
      sessionSlots: 240,
      totalWidth: 480,
      dpr: 1,
      slotIndices: [119, 120, 120, 121],
    })

    expect(layout).not.toBeNull()
    expect(layout!.barVisible).toEqual([true, false, true, true])
  })
})

describe('computeTimeShareVisibleRange', () => {
  it('covers full data when scrolled to left edge (no scroll in timeshare)', () => {
    const r = computeTimeShareVisibleRange({
      scrollLeft: 0,
      totalWidth: 900,
      viewWidth: 900,
      dataLength: 240,
      sessionSlots: 240,
    })
    expect(r.start).toBe(-1)
    expect(r.end).toBe(240)
  })

  it('uses the same step grid as the layout for a scrolled viewport', () => {
    // step = 480/240 = 2；视口 [120, 360] 覆盖第 60..179 槽
    const r = computeTimeShareVisibleRange({
      scrollLeft: 120,
      totalWidth: 480,
      viewWidth: 240,
      dataLength: 240,
      sessionSlots: 240,
    })
    expect(r.start).toBe(59)
    expect(r.end).toBe(181)
  })

  it('respects per-market session slots (HK 330) without clipping', () => {
    const r = computeTimeShareVisibleRange({
      scrollLeft: 0,
      totalWidth: 990,
      viewWidth: 990,
      dataLength: 330,
      sessionSlots: 330,
    })
    expect(r.start).toBe(-1)
    expect(r.end).toBe(330)
  })

  it('returns empty range for invalid input', () => {
    expect(
      computeTimeShareVisibleRange({
        scrollLeft: 0,
        totalWidth: 0,
        viewWidth: 480,
        dataLength: 240,
        sessionSlots: 240,
      }),
    ).toEqual({ start: 0, end: 0 })
    expect(
      computeTimeShareVisibleRange({
        scrollLeft: 0,
        totalWidth: 480,
        viewWidth: 480,
        dataLength: 0,
        sessionSlots: 240,
      }),
    ).toEqual({ start: 0, end: 0 })
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
    })
    // 9:30 → 0；13:00 → 120；15:00 → 239
    expect(labels).toEqual([0, 120, 239])
  })

  it('returns empty for invalid axis width', () => {
    expect(
      computeTimeShareTimeLabelIndices({
        axisWidth: 0,
      }),
    ).toEqual([])
  })
})

describe('timeShare slot time/x helpers', () => {
  it('maps gotdx closing timestamps to the lunch boundary without overlap', () => {
    const time = (hour: number, minute: number) => Date.UTC(2026, 6, 28, hour - 8, minute)

    expect(resolveTimestampSessionSlot(time(9, 30))).toBe(0)
    expect(resolveTimestampSessionSlot(time(11, 30))).toBe(120)
    expect(resolveTimestampSessionSlot(time(13, 0))).toBe(120)
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
