/** 验证支持周期、开收线边界和倒计时格式。 */
import { describe, expect, it } from 'vitest'
import { formatLastPriceCountdown, getLastPriceRemainingMs } from '../index.js'

describe('last price countdown', () => {
  const opened = 1_700_000_000_000

  it.each([
    ['1min', 60_000, '01:00'],
    ['5min', 300_000, '05:00'],
    ['15min', 900_000, '15:00'],
    ['30min', 1_800_000, '30:00'],
    ['60min', 3_600_000, '01:00:00'],
    ['4h', 14_400_000, '04:00:00'],
    ['daily', 86_400_000, '24:00:00'],
  ])('formats %s before close', (period, duration, text) => {
    expect(getLastPriceRemainingMs(period, opened, opened)).toBe(duration)
    expect(formatLastPriceCountdown(period, opened, opened)).toBe(text)
    expect(formatLastPriceCountdown(period, opened, opened + duration - 1)).toBe('00:01')
    expect(formatLastPriceCountdown(period, opened, opened + duration)).toBeNull()
  })

  it('does not count down unsupported, future or invalid bars', () => {
    expect(formatLastPriceCountdown('weekly', opened, opened)).toBeNull()
    expect(formatLastPriceCountdown('5min', opened, opened - 1)).toBeNull()
    expect(formatLastPriceCountdown('5min', Number.NaN, opened)).toBeNull()
  })
})
