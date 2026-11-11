/** 时间语义层的契约测试：格式化复用、日历刻度与「不做逐槽扫描」的性能护栏。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createMarketSessionTimeFormatter,
  createSeriesTimeProjection,
  createTimeFormatter,
  formatDateInTimeZone,
  formatDateTimeInTimeZone,
  formatTimeInTimeZone,
  frameTimeTicks,
  resolveDisplayTimeZone,
  resolveTimeTickTarget,
  resolveTimeTickUnit,
} from '../index'

const DAY_MS = 86_400_000

function dailyBars(count: number, start = Date.UTC(2025, 9, 23)): Array<{ timestamp: number }> {
  return Array.from({ length: count }, (_, index) => ({ timestamp: start + index * DAY_MS }))
}

/** 用同一份序列时间投影调用刻度，避免测试自带第二套坐标规则。 */
function ticksOf(
  data: ReadonlyArray<{ timestamp: number }>,
  firstIndex: number,
  lastIndex: number,
  unit: 'day' | 'month' | 'year',
  target?: number,
  timeZone = 'UTC',
) {
  return frameTimeTicks({
    projection: createSeriesTimeProjection(data),
    firstIndex,
    lastIndex,
    unit,
    timeZone,
    target,
  })
}

describe('time formatter', () => {
  it('uses the configured IANA zone for every label', () => {
    const utc = createTimeFormatter('UTC')
    const newYork = createTimeFormatter('America/New_York')
    const timestamp = Date.parse('2025-02-01T00:30:00Z')

    expect(utc.formatDate(timestamp)).toBe('2025-02-01')
    expect(newYork.formatDate(timestamp)).toBe('2025-01-31')
    // 周几与日期必须同时按显示时区换算，不允许一边 UTC 一边本地。
    expect(utc.formatDateWithWeekday(timestamp)).toBe('周六 2025-02-01')
    expect(newYork.formatDateWithWeekday(timestamp)).toBe('周五 2025-01-31')
  })

  it('keeps the clock time in weekday labels for intraday surfaces', () => {
    const utc = createTimeFormatter('UTC')
    expect(utc.formatDateTimeWithWeekday(Date.parse('2025-02-01T00:30:00Z'))).toBe(
      '周六 2025-02-01 00:30',
    )
  })

  it('handles DST through Intl without offset arithmetic', () => {
    const formatter = createTimeFormatter('America/New_York')
    expect(formatter.formatDateTime(Date.parse('2025-03-09T06:30:00Z'))).toBe('2025-03-09 01:30')
    expect(formatter.formatDateTime(Date.parse('2025-03-09T07:30:00Z'))).toBe('2025-03-09 03:30')
  })

  it('resolves the display zone deterministically for UTC', () => {
    expect(resolveDisplayTimeZone('UTC')).toBe('UTC')
  })

  it('shares one rule for standalone text and trading dates', () => {
    const timestamp = Date.parse('2025-01-15T14:30:00Z')
    expect(formatDateTimeInTimeZone(timestamp)).toBe('2025-01-15 22:30')
    expect(formatDateInTimeZone(timestamp, 'America/New_York')).toBe('2025-01-15')
    expect(formatTimeInTimeZone(timestamp, { timeZone: 'UTC', showTime: false })).toBe('2025-01-15')
    expect(formatTimeInTimeZone(timestamp, { timeZone: 'America/New_York', showTime: true })).toBe(
      '2025-01-15 09:30',
    )
  })

  it('formats market session time in the exchange zone', () => {
    const market = createMarketSessionTimeFormatter('America/New_York')
    expect(market.formatAxisTime(Date.parse('2025-01-15T14:30:00Z'))).toBe('09:30')
  })
})

describe('time axis ticks', () => {
  it('maps periods to label units', () => {
    expect(resolveTimeTickUnit('5min')).toBe('day')
    expect(resolveTimeTickUnit('4h')).toBe('day')
    expect(resolveTimeTickUnit('daily')).toBe('month')
    expect(resolveTimeTickUnit('weekly')).toBe('year')
  })

  it('derives label density from width only', () => {
    expect(resolveTimeTickTarget(80)).toBe(3)
    expect(resolveTimeTickTarget(800)).toBe(8)
    expect(resolveTimeTickTarget(4000)).toBe(8)
  })

  it('labels month boundaries, including future padding', () => {
    const data = dailyBars(100)
    const ticks = ticksOf(data, 1, 132, 'month', 8)
    expect(ticks.map((tick) => tick.label)).toEqual(['11月', '12月', '2026', '2月', '3月'])
    // 刻度吸附到「该月第一根」，且索引严格递增。
    for (let index = 1; index < ticks.length; index++)
      expect(ticks[index]!.index).toBeGreaterThan(ticks[index - 1]!.index)
  })

  it('labels derived dates in past padding without relative placeholders', () => {
    const data = dailyBars(100)
    const ticks = ticksOf(data, -166, -34, 'month', 8)
    expect(ticks.map((tick) => tick.label)).toEqual(['6月', '7月', '8月', '9月'])
  })

  it('marks day boundaries for intraday periods and years as major', () => {
    const start = Date.UTC(2025, 9, 23)
    const data = Array.from({ length: 12 }, (_, index) => ({
      timestamp: start + index * 4 * 3_600_000,
    }))
    const ticks = ticksOf(data, -1, 11, 'day', 3)
    expect(ticks.map((tick) => tick.label)).toEqual(['10-23', '10-24'])
    expect(ticks.every((tick) => tick.major === false)).toBe(true)

    const yearData = Array.from({ length: 3 }, (_, index) => ({
      timestamp: Date.UTC(2024 + index, 0, 1),
    }))
    const years = frameTimeTicks({
      projection: createSeriesTimeProjection(yearData),
      firstIndex: 0,
      lastIndex: 2,
      unit: 'year',
      timeZone: 'UTC',
      target: 4,
    })
    expect(years.map((tick) => tick.label)).toEqual(['2024', '2025', '2026'])
    expect(years.every((tick) => tick.major)).toBe(true)
  })

  it('enumerates every boundary when no density target is given', () => {
    const data = dailyBars(400)
    const all = ticksOf(data, 0, 399, 'month')
    expect(all).toHaveLength(13)
  })

  it('never formats per visible slot, however many are on screen', () => {
    const data = dailyBars(5000)
    const parts = vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts')
    try {
      const ticks = ticksOf(data, 0, 4999, 'month', 8)
      expect(ticks.length).toBeLessThanOrEqual(12)
      // UTC 下连时区偏移都不需要 Intl：刻度成本不随可见槽位增长。
      expect(parts).not.toHaveBeenCalled()
    } finally {
      parts.mockRestore()
    }
  })
})

describe('time axis ticks across display zones', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('samples the zone offset once per range instead of per slot', () => {
    const data = dailyBars(5000)
    const parts = vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts')
    const ticks = ticksOf(data, 0, 4999, 'month', 8, 'America/New_York')
    expect(ticks.length).toBeGreaterThan(0)
    expect(parts.mock.calls.length).toBeLessThanOrEqual(1)
  })
})
