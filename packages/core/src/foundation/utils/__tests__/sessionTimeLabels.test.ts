import { describe, expect, it, vi } from 'vitest'

import {
  ASHARE_MARKET_SESSION,
  HK_MARKET_SESSION,
  KR_MARKET_SESSION,
  US_MARKET_SESSION,
  computeSessionTimeLabels,
  countSessionSlots,
  minuteOfDayToTimestamp,
  resolveMarketSessionSlots,
  resolveSessionSlotPhysicalGrid,
  resolveTimestampSessionSlot,
  sessionSlotCenterX,
  type MarketSessionConfig,
  type OpenTimeRange,
} from '../sessionTimeLabels'

function hm(h: number, m: number): number {
  return h * 60 + m
}

describe('countSessionSlots / resolveMarketSessionSlots', () => {
  it('A-share is 240 one-minute slots', () => {
    expect(countSessionSlots(ASHARE_MARKET_SESSION.sessions)).toBe(240)
    expect(resolveMarketSessionSlots(ASHARE_MARKET_SESSION)).toBe(240)
  })

  it('HK is 330, KR and US are 390 (not maxed to 240)', () => {
    expect(resolveMarketSessionSlots(HK_MARKET_SESSION)).toBe(330)
    expect(resolveMarketSessionSlots(KR_MARKET_SESSION)).toBe(390)
    expect(resolveMarketSessionSlots(US_MARKET_SESSION)).toBe(390)
  })

  it('respects slotMinutes (e.g. 5-min bars)', () => {
    const cfg: MarketSessionConfig = {
      ...ASHARE_MARKET_SESSION,
      slotMinutes: 5,
    }
    // 240 分钟 / 5 = 48
    expect(resolveMarketSessionSlots(cfg)).toBe(48)
  })

  it('does not expand slots by arrived data length (sessions are SSOT)', () => {
    expect(resolveMarketSessionSlots(ASHARE_MARKET_SESSION, 300)).toBe(240)
    expect(resolveMarketSessionSlots(HK_MARKET_SESSION, 100)).toBe(330)
  })
})

describe('computeSessionTimeLabels multi-market', () => {
  it('A-share closed-side endpoints only', () => {
    const labels = computeSessionTimeLabels(ASHARE_MARKET_SESSION.sessions, { axisWidth: 800 })
    expect(labels.map((l) => l.minuteOfDay)).toEqual([hm(9, 30), hm(13, 0), hm(15, 0)])
  })

  it('HK endpoints: 09:30 / 13:00 / 16:00', () => {
    const labels = computeSessionTimeLabels(HK_MARKET_SESSION.sessions, { axisWidth: 800 })
    expect(labels.map((l) => l.minuteOfDay)).toEqual([hm(9, 30), hm(13, 0), hm(16, 0)])
    expect(labels.map((l) => l.slotIndex)).toEqual([0, 150, 329])
  })

  it('US single continuous session endpoints: 09:30 / 16:00', () => {
    const labels = computeSessionTimeLabels(US_MARKET_SESSION.sessions, { axisWidth: 800 })
    expect(labels.map((l) => l.minuteOfDay)).toEqual([hm(9, 30), hm(16, 0)])
    expect(labels.map((l) => l.slotIndex)).toEqual([0, 389])
  })

  it('KR single continuous session endpoints: 09:00 / 15:30', () => {
    const labels = computeSessionTimeLabels(KR_MARKET_SESSION.sessions, { axisWidth: 800 })
    expect(labels.map((label) => label.minuteOfDay)).toEqual([hm(9, 0), hm(15, 30)])
    expect(labels.map((label) => label.slotIndex)).toEqual([0, 389])
  })

  it('accepts arbitrary sessions via config.sessions', () => {
    const night: OpenTimeRange[] = [
      { open: hm(21, 0), close: hm(23, 0) },
      { open: hm(0, 0), close: hm(2, 30) },
    ]
    // 两段同日分钟：21:00-23:00 (120) + 0:00-2:30 (150) = 270
    // 闭侧端点：21:00, 0:00, 2:30
    const labels = computeSessionTimeLabels(night, { axisWidth: 800 })
    expect(labels.map((l) => l.minuteOfDay)).toEqual([hm(21, 0), hm(0, 0), hm(2, 30)])
    expect(countSessionSlots(night)).toBe(270)
  })
})

describe('session slot physical grid', () => {
  it('uses a fixed integer pitch and symmetric margins', () => {
    const grid = resolveSessionSlotPhysicalGrid(600, 240, 1)

    expect(grid).toEqual({
      axisWidthPx: 600,
      unitPx: 2,
      contentWidthPx: 480,
      offsetPx: 60,
    })
    expect(sessionSlotCenterX(0, 600, 240, 1)).toBe(61)
    expect(sessionSlotCenterX(1, 600, 240, 1)).toBe(63)
  })

  it('falls back when the physical axis cannot fit one pixel per slot', () => {
    expect(resolveSessionSlotPhysicalGrid(200, 240, 1)).toBeNull()
    expect(sessionSlotCenterX(239, 200, 240, 1)).toBeLessThanOrEqual(200)
  })
})

describe('minuteOfDayToTimestamp timeZone', () => {
  it('maps wall clock in Asia/Shanghai independently of host local TZ', () => {
    // 任意 UTC 锚点落在 2026-07-21 上海日历日
    const base = Date.UTC(2026, 6, 21, 4, 0, 0) // 12:00 CST
    const ts = minuteOfDayToTimestamp(base, hm(9, 30), 'Asia/Shanghai')
    // 2026-07-21 09:30 Asia/Shanghai = 01:30 UTC
    expect(ts).toBe(Date.UTC(2026, 6, 21, 1, 30, 0))
  })

  it('maps wall clock in America/New_York for US session open', () => {
    // 2026-07-21 是美东夏令时 EDT (UTC-4)
    const base = Date.UTC(2026, 6, 21, 16, 0, 0) // 12:00 EDT
    const ts = minuteOfDayToTimestamp(base, hm(9, 30), 'America/New_York')
    expect(ts).toBe(Date.UTC(2026, 6, 21, 13, 30, 0)) // 09:30 EDT
  })
})

describe('resolveTimestampSessionSlot', () => {
  it('maps timestamps with the market time zone and session boundaries', () => {
    expect(resolveTimestampSessionSlot(Date.UTC(2026, 6, 21, 1, 30), ASHARE_MARKET_SESSION)).toBe(
      0,
    )
    expect(resolveTimestampSessionSlot(Date.UTC(2026, 6, 21, 3, 30), ASHARE_MARKET_SESSION)).toBe(
      120,
    )
    expect(resolveTimestampSessionSlot(Date.UTC(2026, 6, 21, 7, 0), ASHARE_MARKET_SESSION)).toBe(
      239,
    )
    expect(resolveTimestampSessionSlot(Date.UTC(2026, 6, 21, 13, 30), US_MARKET_SESSION)).toBe(0)
  })

  it('reuses the Intl formatter for repeated timestamps in one market', () => {
    const timeZone = 'Pacific/Honolulu'
    const NativeDateTimeFormat = Intl.DateTimeFormat
    const formatterSpy = vi
      .spyOn(Intl, 'DateTimeFormat')
      .mockImplementation(function DateTimeFormat(locales, options) {
        return new NativeDateTimeFormat(locales, options)
      })
    const config: MarketSessionConfig = {
      timeZone,
      sessions: [{ open: hm(9, 30), close: hm(16, 0) }],
    }

    try {
      expect(resolveTimestampSessionSlot(Date.UTC(2026, 6, 21, 19, 30), config)).toBe(0)
      expect(resolveTimestampSessionSlot(Date.UTC(2026, 6, 21, 19, 31), config)).toBe(1)

      const formatterCreations = formatterSpy.mock.calls.filter(
        ([, options]) => (options as Intl.DateTimeFormatOptions | undefined)?.timeZone === timeZone,
      )
      expect(formatterCreations).toHaveLength(1)
    } finally {
      formatterSpy.mockRestore()
    }
  })
})
