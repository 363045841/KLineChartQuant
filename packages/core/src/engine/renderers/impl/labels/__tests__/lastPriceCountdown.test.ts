/** 验证倒计时只由开线时间与周期长度决定，覆盖固定时长及 UTC 日历周期。 */
import { describe, expect, it } from 'vitest'
import { formatLastPriceCountdown, getLastPriceRemainingMs } from '../index.js'

describe('last price countdown', () => {
  // 所有标准周期均从实际开线时间推进，不对齐交易所或整点边界。
  it.each([
    ['1min', '2026-06-01T10:02:03Z', '2026-06-01T10:03:03Z'],
    ['5min', '2026-06-01T10:02:03Z', '2026-06-01T10:07:03Z'],
    ['15min', '2026-06-01T10:02:03Z', '2026-06-01T10:17:03Z'],
    ['30min', '2026-06-01T10:02:03Z', '2026-06-01T10:32:03Z'],
    ['60min', '2026-06-01T11:00:00+08:00', '2026-06-01T12:00:00+08:00'],
    ['4h', '2026-06-01T14:30:00+08:00', '2026-06-01T18:30:00+08:00'],
    ['daily', '2026-06-05T14:30:00+08:00', '2026-06-06T14:30:00+08:00'],
    ['weekly', '2026-06-05T14:30:00+08:00', '2026-06-12T14:30:00+08:00'],
    ['monthly', '2026-02-01T00:00:00Z', '2026-03-01T00:00:00Z'],
    ['quarterly', '2026-11-01T00:00:00Z', '2027-02-01T00:00:00Z'],
    ['yearly', '2026-06-01T00:00:00Z', '2027-06-01T00:00:00Z'],
    ['monthly', '2028-01-31T12:34:56.789Z', '2028-02-29T12:34:56.789Z'],
    ['yearly', '2028-02-29T12:34:56.789Z', '2029-02-28T12:34:56.789Z'],
    ['daily', '2026-03-08T00:00:00-05:00', '2026-03-09T01:00:00-04:00'],
    ['5min', '2026-06-07T23:59:00Z', '2026-06-08T00:04:00Z'],
  ])('advances %s by one period', (period, bar, end) => {
    const opened = Date.parse(bar)
    const closesAt = Date.parse(end)
    expect(getLastPriceRemainingMs(period, opened, opened)).toBe(closesAt - opened)
    expect(getLastPriceRemainingMs(period, opened, closesAt - 1)).toBe(1)
    expect(getLastPriceRemainingMs(period, opened, closesAt)).toBeNull()
    expect(getLastPriceRemainingMs(period, opened, closesAt + 1)).toBeNull()
  })

  // 失效或未来的 K 线不能生成倒计时，也不能用当前时间取模伪造新周期。
  it.each([
    ['timeshare', 0, 0],
    ['5daytimeshare', 0, 0],
    ['unknown', 0, 0],
    ['toString', 0, 0],
    ['5min', 1_000, 999],
    ['5min', Number.NaN, 0],
    ['5min', 0, Number.NaN],
    ['5min', Number.POSITIVE_INFINITY, 0],
    ['5min', 0, Number.POSITIVE_INFINITY],
    ['5min', 1e20, 1e20],
    ['monthly', 8_640_000_000_000_000, 8_640_000_000_000_000],
  ])('hides invalid input %s / %s / %s', (period, bar, now) => {
    expect(getLastPriceRemainingMs(period, bar, now)).toBeNull()
  })

  // 文本只消费已经计算的剩余时间，与帧计时器共享同一数值。
  it.each([
    [300_000, '05:00'],
    [299_001, '05:00'],
    [299_000, '04:59'],
    [3_600_000, '01:00:00'],
    [86_400_000, '24:00:00'],
    [604_800_000, '168:00:00'],
    [1, '00:01'],
    [0, null],
    [-1, null],
    [Number.NaN, null],
    [Number.POSITIVE_INFINITY, null],
    [null, null],
  ])('formats remaining milliseconds %s', (remaining, expected) => {
    expect(formatLastPriceCountdown(remaining)).toBe(expected)
  })
})
