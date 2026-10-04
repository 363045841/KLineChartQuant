/** 分时价格范围、涨跌幅基准与交易时段横向几何的回归测试。 */
import { describe, expect, it } from 'vitest'

import {
  resolveTimeShareSlotTimestamp,
  resolveTimestampSessionSlot,
  timeShareSlotCenterX,
} from '@/foundation/utils/timeShareAxisLabels'
import {
  ASHARE_TIMESHARE_SESSION_SLOTS,
  computeTimeSharePriceRange,
  computeTimeShareTimeLabelIndices,
  computeTimeShareXLayout,
  resolveFiveDayTimeShareBaseline,
  resolveTimeShareBaseline,
  resolveTimeShareSessionSlots,
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
  it('fits visible extrema with padding proportional to the price span', () => {
    const range = computeTimeSharePriceRange([11, 10.5, 10.2])!
    expect(range.maxPrice).toBeCloseTo(11.08, 8)
    expect(range.minPrice).toBeCloseTo(10.12, 8)
  })

  it.each([1, 0.000001, 1000000])('preserves small movements at price scale %s', (scale) => {
    const prices = [230.7, 230.75, 230.82].map((price) => price * scale)
    const range = computeTimeSharePriceRange(prices)!
    const span = prices[2]! - prices[0]!
    // 价格振幅应占纵轴区间的 5/6，不因价格量级而被压扁。
    expect(span / (range.maxPrice - range.minPrice)).toBeCloseTo(5 / 6, 8)
    expect(range.minPrice).toBeLessThan(prices[0]!)
    expect(range.maxPrice).toBeGreaterThan(prices[2]!)
  })

  it.each([10, 0, -10])('provides a non-zero centered range on a flat day at %s', (price) => {
    const range = computeTimeSharePriceRange([price, price])!
    expect(range.minPrice).toBeLessThan(price)
    expect(range.maxPrice).toBeGreaterThan(price)
    expect((range.minPrice + range.maxPrice) / 2).toBeCloseTo(price, 8)
  })

  it('ignores missing and non-finite values without distorting the extrema', () => {
    expect(computeTimeSharePriceRange([null, undefined, NaN, Infinity, -Infinity, 10, 11])).toEqual(
      {
        minPrice: 9.9,
        maxPrice: 11.1,
      },
    )
    expect(computeTimeSharePriceRange([])).toBeNull()
    expect(computeTimeSharePriceRange([null, undefined, NaN, Infinity])).toBeNull()
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
