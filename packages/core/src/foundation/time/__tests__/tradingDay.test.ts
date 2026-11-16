/** 交易日划分的契约测试：交易日起点决定归属，不读取交易日历。 */
import { describe, expect, it } from 'vitest'
import { createTradingDayIndexer, type TradingDaySession } from '../index'

/** 按市场时区墙钟构造时间戳，避免测试自己换算时区。 */
function wallClock(iso: string): number {
  return new Date(iso).getTime()
}

/** 同一市场下成对的时间戳；`sameDays` 期望同属一交易日，`otherDays` 期望跨交易日。 */
type Pair = readonly [left: string, right: string]

interface CalendarCase {
  readonly name: string
  readonly session: TradingDaySession
  readonly reference: string
  readonly sameDays: readonly Pair[]
  readonly otherDays: readonly Pair[]
}

const CALENDAR_CASES: readonly CalendarCase[] = [
  {
    name: '无夜盘市场按自然日划分，午休属同一天',
    session: { timeZone: 'Asia/Shanghai' },
    reference: '2026-01-05T09:30:00+08:00',
    sameDays: [['2026-01-05T09:30:00+08:00', '2026-01-05T14:00:00+08:00']],
    otherDays: [['2026-01-02T15:00:00+08:00', '2026-01-05T09:30:00+08:00']],
  },
  {
    name: '连续交易市场按 UTC 零点切分',
    session: { timeZone: 'UTC' },
    reference: '2026-01-05T00:00:00Z',
    sameDays: [['2026-01-05T00:00:00Z', '2026-01-05T23:00:00Z']],
    otherDays: [['2026-01-04T23:59:00Z', '2026-01-05T00:00:00Z']],
  },
  {
    name: '按市场时区而非 UTC 归属',
    // 上海 00:30 是 UTC 前一天 16:30，必须归入当天。
    session: { timeZone: 'Asia/Shanghai' },
    reference: '2026-01-05T00:00:00+08:00',
    sameDays: [],
    otherDays: [['2026-01-04T23:30:00+08:00', '2026-01-05T00:30:00+08:00']],
  },
]

describe('createTradingDayIndexer', () => {
  it('keeps a night session and the following day session in one trading day', () => {
    // 国内商品期货：夜盘 21:00 开盘，跨零点后仍属下一交易日。
    const index = createTradingDayIndexer(
      { timeZone: 'Asia/Shanghai', tradingDayStartMinute: 1200 },
      wallClock('2026-01-04T21:00:00+08:00'),
    )
    const nightOpen = wallClock('2026-01-04T21:00:00+08:00')
    const afterMidnight = wallClock('2026-01-05T01:00:00+08:00')
    const daySession = wallClock('2026-01-05T09:00:00+08:00')
    const dayClose = wallClock('2026-01-05T15:00:00+08:00')
    const nextNightOpen = wallClock('2026-01-05T21:00:00+08:00')

    expect(index(afterMidnight)).toBe(index(nightOpen))
    expect(index(daySession)).toBe(index(nightOpen))
    expect(index(dayClose)).toBe(index(nightOpen))
    // 日盘收盘与当晚夜盘之间才是真正的交易日切换。
    expect(index(nextNightOpen)).not.toBe(index(dayClose))
  })

  it.each(CALENDAR_CASES)('$name', ({ session, reference, sameDays, otherDays }) => {
    const index = createTradingDayIndexer(session, wallClock(reference))
    for (const [left, right] of sameDays)
      expect(index(wallClock(left))).toBe(index(wallClock(right)))
    for (const [left, right] of otherDays)
      expect(index(wallClock(left))).not.toBe(index(wallClock(right)))
  })
})
