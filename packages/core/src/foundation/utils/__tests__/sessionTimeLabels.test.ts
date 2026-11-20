/**
 * 交易时段几何：槽位数量、时段边界标签、物理网格、时区换算与时间戳落槽。
 *
 * 多市场行为用参数表表达，差异只在配置与期望值。
 */

import { describe, expect, it, vi } from 'vitest'

import {
  ASHARE_MARKET_SESSION,
  computeSessionTimeLabels,
  countSessionSlots,
  HK_MARKET_SESSION,
  KR_MARKET_SESSION,
  type MarketSessionConfig,
  minuteOfDayToTimestamp,
  type OpenTimeRange,
  resolveMarketSessionSlots,
  resolveSessionSlotPhysicalGrid,
  resolveTimestampSessionSlot,
  sessionSlotCenterX,
  US_MARKET_SESSION,
} from '../sessionTimeLabels'

function hm(h: number, m: number): number {
  return h * 60 + m
}

describe('会话槽位数量', () => {
  it.each([
    { name: 'A 股', config: ASHARE_MARKET_SESSION, slots: 240 },
    { name: '港股', config: HK_MARKET_SESSION, slots: 330 },
    { name: '韩股', config: KR_MARKET_SESSION, slots: 390 },
    { name: '美股', config: US_MARKET_SESSION, slots: 390 },
  ])('$name 为 $slots 个一分钟槽位，且 countSessionSlots 与之一致', ({ config, slots }) => {
    expect(resolveMarketSessionSlots(config)).toBe(slots)
    expect(countSessionSlots(config.sessions)).toBe(slots)
  })

  it('按 slotMinutes 折算（5 分钟线）', () => {
    const cfg: MarketSessionConfig = { ...ASHARE_MARKET_SESSION, slotMinutes: 5 }
    expect(resolveMarketSessionSlots(cfg)).toBe(48)
  })

  it('不按已到达数据长度扩张槽位（时段是 SSOT）', () => {
    expect(resolveMarketSessionSlots(ASHARE_MARKET_SESSION, 300)).toBe(240)
    expect(resolveMarketSessionSlots(HK_MARKET_SESSION, 100)).toBe(330)
  })
})

describe('computeSessionTimeLabels 多市场边界', () => {
  it.each([
    {
      name: 'A 股',
      config: ASHARE_MARKET_SESSION,
      minutes: [hm(9, 30), hm(13, 0), hm(15, 0)],
      slots: [0, 120, 239],
    },
    {
      name: '港股',
      config: HK_MARKET_SESSION,
      minutes: [hm(9, 30), hm(13, 0), hm(16, 0)],
      slots: [0, 150, 329],
    },
    {
      name: '美股',
      config: US_MARKET_SESSION,
      minutes: [hm(9, 30), hm(16, 0)],
      slots: [0, 389],
    },
    {
      name: '韩股',
      config: KR_MARKET_SESSION,
      minutes: [hm(9, 0), hm(15, 30)],
      slots: [0, 389],
    },
  ])('$name 只在时段端点出标签', ({ config, minutes, slots }) => {
    const labels = computeSessionTimeLabels(config.sessions, { axisWidth: 800 })
    expect(labels.map((label) => label.minuteOfDay)).toEqual(minutes)
    expect(labels.map((label) => label.slotIndex)).toEqual(slots)
  })

  it('接受任意自定义时段', () => {
    const night: OpenTimeRange[] = [
      { open: hm(21, 0), close: hm(23, 0) },
      { open: hm(0, 0), close: hm(2, 30) },
    ]
    const labels = computeSessionTimeLabels(night, { axisWidth: 800 })

    expect(labels.map((label) => label.minuteOfDay)).toEqual([hm(21, 0), hm(0, 0), hm(2, 30)])
    expect(countSessionSlots(night)).toBe(270)
  })
})

describe('会话槽位物理网格', () => {
  it('使用固定整数 pitch 与对称留白', () => {
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

  it('物理轴放不下每槽一像素时回退', () => {
    expect(resolveSessionSlotPhysicalGrid(200, 240, 1)).toBeNull()
    expect(sessionSlotCenterX(239, 200, 240, 1)).toBeLessThanOrEqual(200)
  })
})

describe('minuteOfDayToTimestamp 时区换算', () => {
  it.each([
    {
      name: 'Asia/Shanghai 09:30',
      base: Date.UTC(2026, 6, 21, 4, 0, 0),
      minuteOfDay: hm(9, 30),
      timeZone: 'Asia/Shanghai',
      expected: Date.UTC(2026, 6, 21, 1, 30, 0),
    },
    {
      name: 'America/New_York 09:30 (EDT)',
      base: Date.UTC(2026, 6, 21, 16, 0, 0),
      minuteOfDay: hm(9, 30),
      timeZone: 'America/New_York',
      expected: Date.UTC(2026, 6, 21, 13, 30, 0),
    },
  ])('$name 不依赖宿主本地时区', ({ base, minuteOfDay, timeZone, expected }) => {
    expect(minuteOfDayToTimestamp(base, minuteOfDay, timeZone)).toBe(expected)
  })
})

describe('resolveTimestampSessionSlot', () => {
  it.each([
    { name: 'A 股开盘', ts: Date.UTC(2026, 6, 21, 1, 30), session: ASHARE_MARKET_SESSION, slot: 0 },
    { name: 'A 股午盘', ts: Date.UTC(2026, 6, 21, 3, 30), session: ASHARE_MARKET_SESSION, slot: 120 },
    { name: 'A 股收盘', ts: Date.UTC(2026, 6, 21, 7, 0), session: ASHARE_MARKET_SESSION, slot: 239 },
    { name: '美股开盘', ts: Date.UTC(2026, 6, 21, 13, 30), session: US_MARKET_SESSION, slot: 0 },
  ])('$name 按市场时区与时段边界落槽', ({ ts, session, slot }) => {
    expect(resolveTimestampSessionSlot(ts, session)).toBe(slot)
  })

  it('同一市场的重复时间戳复用 Intl formatter', () => {
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
