/** 时间换算缓存必须保留交易边界语义，并限制历史、时区和时段参数增长带来的缓存占用。 */
import { describe, expect, it, vi } from 'vitest'
import type { ScriptTimeContext } from '@363045841yyt/klinechart-plot-contracts'
import { timeValue } from '../../../../plot-contracts/src/timeApi.js'

/** 同一市场配置在多种图表周期中共享，缓存不能依赖 context 或 period 的身份。 */
function clock(timeZone: string, period = '5'): ScriptTimeContext {
  return { period, session: { timeZone, sessions: [{ open: 0, close: 1440 }] } }
}

describe('time API bounded reuse', () => {
  it('reuses exchange boundaries and parsed minutes across repeated PVP history', () => {
    const context = clock('Etc/GMT-3')
    const timestamp = Date.UTC(2026, 0, 5)
    const format = vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts')
    try {
      for (let pass = 0; pass < 2; pass++) {
        for (let index = 0; index < 1000; index++) {
          const time = timestamp + index * 60_000
          expect(timeValue(context, 'close', '1', time)).toBe(time + 60_000)
          expect(timeValue(context, 'open', '1D', time)).toBe(Date.UTC(2026, 0, 4, 21))
        }
      }
      expect(format.mock.calls.length).toBeLessThan(1020)
    } finally {
      format.mockRestore()
    }
  })

  it('keeps second, tick and historical timezone precision', () => {
    const context = clock('UTC')
    const time = Date.UTC(2026, 0, 5)
    expect(timeValue(context, 'open', '5S', time + 12_345)).toBe(time + 10_000)
    expect(timeValue(context, 'close', '5S', time + 17_999)).toBe(time + 20_000)
    expect(timeValue(context, 'open', '1', time + 59_999)).toBe(time)
    expect(timeValue(context, 'open', '1', time + 60_000)).toBe(time + 60_000)
    const historical: ScriptTimeContext = {
      period: '1',
      session: {
        timeZone: 'Asia/Shanghai',
        sessions: [{ open: 570, close: 960 }],
      },
    }
    // 1900 年上海采用 UTC+08:05:43；UTC 的同一分钟内可跨当地午夜。
    const midnight = Date.UTC(1900, 0, 1, 15, 54, 17)
    expect(timeValue(historical, 'open', '1D', midnight - 1)).not.toBe(
      timeValue(historical, 'open', '1D', midnight),
    )
  })

  it('preserves DST transitions and overnight weekday ownership', () => {
    const context = clock('America/New_York')
    expect(
      timeValue(context, 'close', '1D', Date.UTC(2026, 2, 8, 17)) -
        timeValue(context, 'open', '1D', Date.UTC(2026, 2, 8, 17)),
    ).toBe(23 * 3600000)
    expect(
      timeValue(context, 'close', '1D', Date.UTC(2026, 10, 1, 17)) -
        timeValue(context, 'open', '1D', Date.UTC(2026, 10, 1, 17)),
    ).toBe(25 * 3600000)
    const overnight: ScriptTimeContext = {
      period: '60',
      session: {
        timeZone: 'UTC',
        sessions: [{ open: 1080, close: 2460 }],
        tradingDays: [0, 1, 2, 3, 4],
      },
    }
    expect(timeValue(overnight, 'open', '1D', Date.UTC(2026, 0, 4, 20))).toBe(
      Date.UTC(2026, 0, 4, 18),
    )
    expect(timeValue(overnight, 'open', '1D', Date.UTC(2026, 0, 5, 8))).toBe(
      Date.UTC(2026, 0, 4, 18),
    )
  })

  it('isolates special calendars, custom sessions, overrides and replaced configurations', () => {
    const context: ScriptTimeContext = {
      period: '60',
      session: {
        timeZone: 'America/New_York',
        sessions: [{ open: 570, close: 960 }],
        tradingDays: [1, 2, 3, 4, 5],
        premarket: [{ open: 240, close: 570 }],
        postmarket: [{ open: 960, close: 1200 }],
        calendars: [
          {
            year: 2026,
            closedDates: ['2026-01-01'],
            specialSessions: [{ date: '2026-11-27', sessions: [{ open: 570, close: 780 }] }],
          },
        ],
      },
    }
    expect(timeValue(context, 'market', '', Date.UTC(2026, 0, 1, 15))).toBe(0)
    expect(timeValue(context, 'close', '1D', Date.UTC(2026, 10, 27, 15))).toBe(
      Date.UTC(2026, 10, 27, 18),
    )
    expect(timeValue(context, 'premarket', '', Date.UTC(2026, 0, 5, 13))).toBe(1)
    expect(timeValue(context, 'postmarket', '', Date.UTC(2026, 0, 5, 22))).toBe(1)
    const time = Date.UTC(2026, 0, 5, 15)
    expect(timeValue(context, 'open', '1D', time, '0930-1600:23456')).toBe(
      Date.UTC(2026, 0, 5, 14, 30),
    )
    expect(timeValue(context, 'open', '1D', time, '0930-1600:23456', 'UTC')).toBe(
      Date.UTC(2026, 0, 5, 9, 30),
    )
    const replaced: ScriptTimeContext = {
      ...context,
      session: { ...context.session, sessions: [{ open: 600, close: 960 }] },
    }
    expect(timeValue(replaced, 'open', '1D', time)).toBe(Date.UTC(2026, 0, 5, 15))
    expect(timeValue(context, 'open', '1D', time)).toBe(Date.UTC(2026, 0, 5, 14, 30))
  })

  it('evicts old minute entries rather than retaining unbounded history', () => {
    const context = clock('Etc/GMT-2')
    const start = Date.UTC(2026, 4, 1)
    timeValue(context, 'market', '', start)
    for (let index = 1; index < 9000; index++)
      timeValue(context, 'market', '', start + index * 60_000)
    const format = vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts')
    try {
      expect(timeValue(context, 'market', '', start)).toBe(1)
      expect(format).toHaveBeenCalled()
    } finally {
      format.mockRestore()
    }
  })
})
