/** 验证市场时段、跨午休周期、收盘边界和夏令时下的收线倒计时。 */
import { describe, expect, it } from 'vitest'
import {
  ASHARE_MARKET_SESSION,
  HK_MARKET_SESSION,
  KR_MARKET_SESSION,
  US_MARKET_SESSION,
} from '@/foundation/utils/sessionTimeLabels.js'
import { FOREX_MARKET_SESSION } from '../../market/forexMarketSession.js'
import { formatLastPriceCountdown, getLastPriceRemainingMs } from '../index.js'

describe('last price countdown', () => {
  it.each([
    ['1min', '01:00'],
    ['5min', '05:00'],
    ['15min', '15:00'],
    ['30min', '30:00'],
    ['60min', '01:00:00'],
    ['4h', '05:30:00'],
  ])('counts %s from the market opening', (period, text) => {
    const opened = Date.parse('2026-06-01T09:30:00+08:00')
    expect(formatLastPriceCountdown(period, opened, ASHARE_MARKET_SESSION, opened)).toBe(text)
  })

  it.each([
    [ASHARE_MARKET_SESSION, '2026-06-01T00:00:00+08:00', '2026-06-01T14:00:00+08:00', '01:00:00'],
    [HK_MARKET_SESSION, '2026-06-01T00:00:00+08:00', '2026-06-01T14:00:00+08:00', '02:00:00'],
    [KR_MARKET_SESSION, '2026-06-01T00:00:00+09:00', '2026-06-01T14:00:00+09:00', '01:30:00'],
    [US_MARKET_SESSION, '2026-06-01T00:00:00-04:00', '2026-06-01T15:00:00-04:00', '01:00:00'],
    [US_MARKET_SESSION, '2026-01-05T00:00:00-05:00', '2026-01-05T15:00:00-05:00', '01:00:00'],
    [FOREX_MARKET_SESSION, '2026-06-01T00:00:00Z', '2026-06-01T23:00:00Z', '01:00:00'],
  ])('ends daily bars at the configured market close', (session, bar, now, expected) => {
    expect(formatLastPriceCountdown('daily', Date.parse(bar), session, Date.parse(now))).toBe(
      expected,
    )
  })

  it('skips lunch when locating the close and includes lunch in elapsed countdown time', () => {
    const bar = Date.parse('2026-06-01T11:00:00+08:00')
    expect(formatLastPriceCountdown('60min', bar, ASHARE_MARKET_SESSION, bar)).toBe('02:30:00')
    expect(
      formatLastPriceCountdown(
        '60min',
        bar,
        ASHARE_MARKET_SESSION,
        Date.parse('2026-06-01T12:00:00+08:00'),
      ),
    ).toBe('01:30:00')
  })

  it('clips incomplete periods at the final close and rounds the last second up', () => {
    const bar = Date.parse('2026-06-01T14:30:00+08:00')
    const close = Date.parse('2026-06-01T15:00:00+08:00')
    expect(getLastPriceRemainingMs('60min', bar, ASHARE_MARKET_SESSION, bar)).toBe(30 * 60_000)
    expect(formatLastPriceCountdown('60min', bar, ASHARE_MARKET_SESSION, close - 1)).toBe('00:01')
    expect(formatLastPriceCountdown('60min', bar, ASHARE_MARKET_SESSION, close)).toBeNull()
  })

  it('uses custom sessions without applying a trading calendar', () => {
    const session = { timeZone: 'UTC', sessions: [{ open: 600, close: 660 }], tradingDays: [1] }
    const bar = Date.parse('2026-06-07T10:00:00Z')
    expect(formatLastPriceCountdown('daily', bar, session, bar)).toBe('01:00:00')
  })

  it('hides countdowns without a valid current bar or market configuration', () => {
    const bar = Date.parse('2026-06-01T09:30:00+08:00')
    expect(formatLastPriceCountdown('weekly', bar, ASHARE_MARKET_SESSION, bar)).toBeNull()
    expect(formatLastPriceCountdown('5min', bar, undefined, bar)).toBeNull()
    expect(formatLastPriceCountdown('5min', bar, ASHARE_MARKET_SESSION, bar - 1)).toBeNull()
    expect(formatLastPriceCountdown('5min', Number.NaN, ASHARE_MARKET_SESSION, bar)).toBeNull()
    expect(formatLastPriceCountdown('5min', bar, ASHARE_MARKET_SESSION, Number.NaN)).toBeNull()
    expect(formatLastPriceCountdown('5min', 1e20, ASHARE_MARKET_SESSION, 1e20)).toBeNull()
    expect(
      formatLastPriceCountdown(
        '5min',
        Date.parse('2026-06-01T12:00:00+08:00'),
        ASHARE_MARKET_SESSION,
        Date.parse('2026-06-01T12:01:00+08:00'),
      ),
    ).toBeNull()
    expect(
      formatLastPriceCountdown(
        'daily',
        bar,
        ASHARE_MARKET_SESSION,
        Date.parse('2026-06-02T10:00:00+08:00'),
      ),
    ).toBeNull()
  })
})
