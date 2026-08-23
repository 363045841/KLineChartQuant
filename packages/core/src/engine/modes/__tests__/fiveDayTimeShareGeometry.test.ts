/** 五日分时共享几何测试。 */
import { describe, expect, it } from 'vitest'
import type { TimeShareRange, TradingDate } from '../../../data/provider/types'
import { ASHARE_MARKET_SESSION } from '../../../foundation/utils/timeShareAxisLabels'
import {
  computeFiveDayTimeShareContentWidth,
  computeFiveDayTimeShareGeometry,
} from '../fiveDayTimeShareGeometry'

/** 创建位于 A 股上午 session 的测试时间戳。 */
function timestampAt(tradingDate: string, minuteOffset: number): number {
  return Date.parse(`${tradingDate}T01:${String(30 + minuteOffset).padStart(2, '0')}:00.000Z`)
}

/** 创建保留交易日边界的多日分时快照。 */
function createRange(dates: string[]): TimeShareRange {
  return {
    instrumentId: 'test',
    timezone: 'Asia/Shanghai',
    requestedDays: dates.length,
    olderData: 'exhausted',
    days: dates.map((tradingDate, dayIndex) => ({
      tradingDate: tradingDate as TradingDate,
      preClose: 10 + dayIndex,
      data: [0, 1].map((minuteOffset) => ({
        timestamp: timestampAt(tradingDate, minuteOffset),
        price: 10 + dayIndex + minuteOffset * 0.1,
        average: 10 + dayIndex + minuteOffset * 0.05,
      })),
    })),
  }
}

describe('fiveDayTimeShareGeometry', () => {
  it('uses one physical pixel per slot as the minimum scrollable content width', () => {
    expect(computeFiveDayTimeShareContentWidth(500, 5, 241, 1)).toBe(1205)
    expect(computeFiveDayTimeShareContentWidth(800, 5, 241, 2)).toBe(800)
  })

  it('maps non-contiguous trading days to independent day segments', () => {
    const range = createRange(['2026-08-14', '2026-08-17'])
    const frame = computeFiveDayTimeShareGeometry({
      range,
      marketSession: ASHARE_MARKET_SESSION,
      contentWidth: 800,
      dpr: 1.25,
    })

    expect(frame).not.toBeNull()
    expect(frame!.centers).toHaveLength(4)
    expect(frame!.geometry.days).toEqual([
      expect.objectContaining({
        tradingDate: '2026-08-14',
        dataStartIndex: 0,
        dataEndIndex: 2,
      }),
      expect.objectContaining({
        tradingDate: '2026-08-17',
        dataStartIndex: 2,
        dataEndIndex: 4,
      }),
    ])
    expect(frame!.geometry.days[1]!.separatorX).toBe(frame!.geometry.days[1]!.startX)
    expect(frame!.centers[1]!).toBeLessThan(frame!.geometry.days[1]!.startX)
    expect(frame!.centers[2]!).toBeGreaterThan(frame!.geometry.days[1]!.startX)
  })

  it('preserves empty trading-day geometry without shifting flattened indexes', () => {
    const range = createRange(['2026-08-13', '2026-08-14', '2026-08-17'])
    range.days[1] = { ...range.days[1]!, data: [] }

    const frame = computeFiveDayTimeShareGeometry({
      range,
      marketSession: ASHARE_MARKET_SESSION,
      contentWidth: 900,
      dpr: 1,
    })

    expect(frame!.geometry.days[1]).toEqual(
      expect.objectContaining({ dataStartIndex: 2, dataEndIndex: 2 }),
    )
    expect(frame!.geometry.days[2]).toEqual(
      expect.objectContaining({ dataStartIndex: 2, dataEndIndex: 4 }),
    )
  })
})
