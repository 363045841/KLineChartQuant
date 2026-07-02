import { describe, it, expect, vi } from 'vitest'

import { createTimeScale } from '../createTimeScale'

describe('createTimeScale', () => {
  it('barIndexToX and xToBarIndex are exact inverses', () => {
    const s = createTimeScale({
      initialFirstVisibleIndex: 12.5,
      initialBarWidth: 9,
      initialLeftPadding: 60,
    })
    for (const i of [0, 1, 17, 99, -3, 12.5, 100.25]) {
      expect(s.xToBarIndex(s.barIndexToX(i))).toBeCloseTo(i, 10)
    }
    for (const x of [0, 60, 123.4, 1000, -50]) {
      expect(s.barIndexToX(s.xToBarIndex(x))).toBeCloseTo(x, 10)
    }
  })

  it('setBarWidth re-derives the X mapping correctly', () => {
    const s = createTimeScale({
      initialFirstVisibleIndex: 0,
      initialBarWidth: 10,
      initialLeftPadding: 0,
    })
    expect(s.barIndexToX(5)).toBe(50)
    s.setBarWidth(20)
    expect(s.barIndexToX(5)).toBe(100)
  })

  it('fractional firstVisibleIndex works in both directions', () => {
    const s = createTimeScale({
      initialFirstVisibleIndex: 10.25,
      initialBarWidth: 8,
      initialLeftPadding: 60,
    })
    // bar 11 should be at (11 - 10.25) * 8 + 60 = 0.75 * 8 + 60 = 66
    expect(s.barIndexToX(11)).toBeCloseTo(66, 10)
    // and the inverse round-trips
    expect(s.xToBarIndex(66)).toBeCloseTo(11, 10)
  })

  it('with calendar present: timeToBarIndex returns the right index for known timestamps', () => {
    const s = createTimeScale()
    const barTimestamps = [
      1_700_000_000_000, 1_700_000_060_000, 1_700_000_120_000, 1_700_000_180_000,
    ]
    s.setCalendar({ barTimestamps })

    expect(s.timeToBarIndex(barTimestamps[0])).toBe(0)
    expect(s.timeToBarIndex(barTimestamps[2])).toBe(2)
    expect(s.timeToBarIndex(barTimestamps[3])).toBe(3)
    // Midway between bars 1 and 2:
    const mid = (barTimestamps[1] + barTimestamps[2]) / 2
    expect(s.timeToBarIndex(mid)).toBeCloseTo(1.5, 10)
  })

  it('barIndexToTime linearly interpolates for fractional indices', () => {
    const s = createTimeScale()
    const barTimestamps = [1_000, 2_000, 4_000]
    s.setCalendar({ barTimestamps })

    expect(s.barIndexToTime(0)).toBe(1_000)
    expect(s.barIndexToTime(2)).toBe(4_000)
    // bar 1.5 → halfway between 2000 and 4000 → 3000
    expect(s.barIndexToTime(1.5)).toBe(3_000)
  })

  it('without calendar: timeToBarIndex and barIndexToTime return null', () => {
    const s = createTimeScale()
    expect(s.timeToBarIndex(1_700_000_000_000)).toBeNull()
    expect(s.barIndexToTime(0)).toBeNull()
  })

  it('calendar: out-of-range queries return null (no extrapolation)', () => {
    const s = createTimeScale()
    s.setCalendar({ barTimestamps: [100, 200, 300] })
    expect(s.timeToBarIndex(50)).toBeNull()
    expect(s.timeToBarIndex(400)).toBeNull()
    expect(s.barIndexToTime(-1)).toBeNull()
    expect(s.barIndexToTime(3.5)).toBeNull()
  })

  it('signals fire on setters and dispose silences writes', () => {
    const s = createTimeScale({
      initialFirstVisibleIndex: 0,
      initialBarWidth: 10,
      initialLeftPadding: 0,
    })
    const onFvi = vi.fn()
    const onBw = vi.fn()
    const onLp = vi.fn()
    s.firstVisibleIndex.subscribe(onFvi)
    s.barWidth.subscribe(onBw)
    s.leftPadding.subscribe(onLp)

    s.setFirstVisibleIndex(5)
    s.setBarWidth(12)
    s.setLeftPadding(30)
    expect(onFvi).toHaveBeenCalledTimes(1)
    expect(onBw).toHaveBeenCalledTimes(1)
    expect(onLp).toHaveBeenCalledTimes(1)

    // dispose: subsequent writes silently no-op (API audit BLOCKER-004
    // harmonization — every controller in core now silences post-dispose).
    s.dispose()
    s.setFirstVisibleIndex(0)
    s.setBarWidth(8)
    // State frozen at pre-dispose values.
    expect(s.firstVisibleIndex()).toBe(5)
    expect(s.barWidth()).toBe(12)
    // Math still works after dispose — it's pure peek().
    // After the writes above: firstVisibleIndex=5, barWidth=12, leftPadding=30
    // → barIndexToX(0) = (0 - 5) * 12 + 30 = -30
    expect(s.barIndexToX(0)).toBe(-30)
  })

  it('rejects non-positive barWidth in both constructor and setter', () => {
    expect(() => createTimeScale({ initialBarWidth: 0 })).toThrow(/BarWidth/)
    expect(() => createTimeScale({ initialBarWidth: -3 })).toThrow(/BarWidth/)

    const s = createTimeScale()
    expect(() => s.setBarWidth(0)).toThrow(/> 0/)
    expect(() => s.setBarWidth(-1)).toThrow(/> 0/)
  })
})
