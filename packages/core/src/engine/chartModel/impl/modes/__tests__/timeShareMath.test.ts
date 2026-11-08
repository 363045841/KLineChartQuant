/** 分时价格范围、涨跌幅基准与交易时段横向几何的回归测试。 */
import { describe, expect, it } from 'vitest'

import {
  resolveTimeShareSlotTimestamp,
  resolveTimestampSessionSlot,
  timeShareSlotCenterX,
} from '@/foundation/utils/timeShareAxisLabels'
import {
  computeTimeSharePriceRange,
  computeTimeShareTimeLabelIndices,
  computeTimeShareXLayout,
  resolveTimeShareBaseline,
} from '../timeShareMath'

describe('resolveTimeShareBaseline', () => {
  it('accepts only a positive finite pre-close', () => {
    expect(resolveTimeShareBaseline(10.5)).toBe(10.5)
    expect(resolveTimeShareBaseline(0)).toBeNull()
    expect(resolveTimeShareBaseline(-1)).toBeNull()
    expect(resolveTimeShareBaseline(null)).toBeNull()
    expect(resolveTimeShareBaseline(undefined)).toBeNull()
    expect(resolveTimeShareBaseline(NaN)).toBeNull()
    expect(resolveTimeShareBaseline(Infinity)).toBeNull()
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

  it('derives the physical width from the physical slot grid', () => {
    const layout = computeTimeShareXLayout({
      arrivedCount: 1,
      sessionSlots: 24,
      totalWidth: 240,
      dpr: 1,
    })

    expect(layout).not.toBeNull()
    expect(layout!.centers[0]).toBe(5)
    expect(layout!.kWidthPx).toBe(10)
  })

  it('keeps center distance constant on non-divisible widths', () => {
    const layout = computeTimeShareXLayout({
      arrivedCount: 3,
      sessionSlots: 240,
      totalWidth: 600,
      dpr: 1,
      slotIndices: [0, 1, 2],
    })

    expect(layout).not.toBeNull()
    expect(layout!.centers).toEqual([61, 63, 65])
    expect(layout!.centers[1]! - layout!.centers[0]!).toBe(2)
    expect(layout!.centers[2]! - layout!.centers[1]!).toBe(2)
  })

  it('keeps indexes aligned for unresolved slots', () => {
    const layout = computeTimeShareXLayout({
      arrivedCount: 3,
      sessionSlots: 240,
      totalWidth: 480,
      dpr: 1,
      slotIndices: [0, null, 2],
    })

    expect(layout).not.toBeNull()
    expect(layout!.centers).toHaveLength(3)
    expect(layout!.centers[1]).toBe(layout!.centers[0])
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
