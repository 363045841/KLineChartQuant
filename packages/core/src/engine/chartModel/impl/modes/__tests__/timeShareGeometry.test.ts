/** 分时共享几何：单日/五日同构、槽位连续性与日边界切段。 */
import { describe, expect, it } from 'vitest'
import type { TimeShareRange } from '@/data/provider/types'
import {
  createTimeShareDay,
  createTimeSharePoint,
  createTimeShareRange,
} from '@/engine/__tests__/helpers/timeShareTestKit'
import { ASHARE_MARKET_SESSION } from '@/foundation/utils/timeShareAxisLabels'
import { computeTimeShareGeometry } from '../timeShareGeometry'

/** 创建位于 A 股上午 session 的测试时间戳。 */
function timestampAt(tradingDate: string, minuteOffset: number): number {
  return Date.parse(`${tradingDate}T01:${String(30 + minuteOffset).padStart(2, '0')}:00.000Z`)
}

/** 创建保留交易日边界的多日分时快照。 */
function createRange(dates: string[]): TimeShareRange {
  return createTimeShareRange({
    days: dates.map((tradingDate, dayIndex) =>
      createTimeShareDay({
        tradingDate,
        preClose: 10 + dayIndex,
        data: [0, 1].map((minuteOffset) =>
          createTimeSharePoint({
            timestamp: timestampAt(tradingDate, minuteOffset),
            price: 10 + dayIndex + minuteOffset * 0.1,
            average: 10 + dayIndex + minuteOffset * 0.05,
          }),
        ),
      }),
    ),
  })
}

describe('computeTimeShareGeometry', () => {
  it('maps non-contiguous trading days to independent day segments', () => {
    const range = createRange(['2026-08-14', '2026-08-17'])
    const frame = computeTimeShareGeometry({
      days: range.days,
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
    expect(frame!.geometry.verticalGridLineXs).toEqual([
      frame!.geometry.days[0]!.startX,
      frame!.geometry.days[1]!.startX,
      frame!.geometry.days[1]!.endX,
    ])
    expect(frame!.centers[1]!).toBeLessThan(frame!.geometry.days[1]!.startX)
    expect(frame!.centers[2]!).toBeGreaterThan(frame!.geometry.days[1]!.startX)
    expect(frame!.geometry.segments).toHaveLength(2)
  })

  it('preserves empty trading-day geometry without shifting flattened indexes', () => {
    const range = createRange(['2026-08-13', '2026-08-14', '2026-08-17'])
    range.days = range.days.map((day, i) => (i === 1 ? { ...day, data: [] } : day))

    const frame = computeTimeShareGeometry({
      days: range.days,
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

  it('uses the same function for a single day', () => {
    const frame = computeTimeShareGeometry({
      days: [
        {
          data: [0, 1, 2, 3].map((minuteOffset) => ({
            timestamp: timestampAt('2026-08-14', minuteOffset),
          })),
        },
      ],
      marketSession: ASHARE_MARKET_SESSION,
      contentWidth: 480,
      dpr: 1,
    })

    expect(frame!.geometry.days).toHaveLength(1)
    expect(frame!.geometry.days[0]!.tradingDate).toBeUndefined()
    // 单日没有日间分隔线，日几何覆盖整个内容宽度。
    expect(frame!.geometry.days[0]).toEqual(
      expect.objectContaining({ startX: 0, endX: 480, labelX: 240 }),
    )
    expect(frame!.geometry.verticalGridLineXs).toEqual([])
    expect(frame!.geometry.segments).toEqual([
      expect.objectContaining({ dataStartIndex: 0, dataEndIndex: 4 }),
    ])
  })

  it('breaks the segment when a slot cannot be resolved', () => {
    const frame = computeTimeShareGeometry({
      days: [
        {
          data: [
            { timestamp: timestampAt('2026-08-14', 0) },
            { timestamp: timestampAt('2026-08-14', 1) },
            // 午休：落在交易时段之外，必须断线且不能挤动后续索引。
            { timestamp: Date.parse('2026-08-14T04:00:00.000Z') },
            { timestamp: timestampAt('2026-08-14', 3) },
            { timestamp: timestampAt('2026-08-14', 4) },
          ],
        },
      ],
      marketSession: ASHARE_MARKET_SESSION,
      contentWidth: 480,
      dpr: 1,
    })

    expect(frame!.geometry.segments).toEqual([
      expect.objectContaining({ dataStartIndex: 0, dataEndIndex: 2 }),
      expect.objectContaining({ dataStartIndex: 3, dataEndIndex: 5 }),
    ])
  })

  it('breaks at day boundaries even when global slot indexes are adjacent', () => {
    const frame = computeTimeShareGeometry({
      days: [
        {
          tradingDate: '2026-08-14',
          data: [
            { timestamp: Date.parse('2026-08-14T06:58:00.000Z') },
            { timestamp: Date.parse('2026-08-14T06:59:00.000Z') },
          ],
        },
        {
          tradingDate: '2026-08-17',
          data: [
            { timestamp: Date.parse('2026-08-17T01:30:00.000Z') },
            { timestamp: Date.parse('2026-08-17T01:31:00.000Z') },
          ],
        },
      ],
      marketSession: ASHARE_MARKET_SESSION,
      contentWidth: 800,
      dpr: 1,
    })

    expect(frame!.geometry.segments).toEqual([
      expect.objectContaining({ dataStartIndex: 0, dataEndIndex: 2 }),
      expect.objectContaining({ dataStartIndex: 2, dataEndIndex: 4 }),
    ])
  })
})
