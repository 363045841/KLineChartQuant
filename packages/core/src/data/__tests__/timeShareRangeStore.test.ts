/** 验证多日分时存储的分组 SSOT、扁平投影、不可变边界与重置行为。 */
import { describe, expect, it } from 'vitest'

import type { TimeShareData } from '../../foundation/types/price'
import type { TimeShareRange } from '../provider/types'
import { TimeShareRangeStore } from '../buffer/timeShareRangeStore'

/** 构造测试分时点。 */
function point(timestamp: number, price: number): TimeShareData {
  return { timestamp, price, average: price, volume: 1 }
}

/** 构造包含两个升序交易日的测试 Range。 */
function range(): TimeShareRange {
  return {
    instrumentId: 'gotdx:stock:1:600519',
    timezone: 'Asia/Shanghai',
    requestedDays: 2,
    olderData: 'unknown',
    days: [
      { tradingDate: '2026-08-05', preClose: 1490, data: [point(1, 1500)] },
      {
        tradingDate: '2026-08-06',
        preClose: 1500,
        data: [point(2, 1510), point(3, 1520)],
      },
    ],
  }
}

describe('TimeShareRangeStore', () => {
  it('keeps days grouped and derives a chronological flat projection', () => {
    const store = new TimeShareRangeStore()
    store.setRange(range())

    expect(store.getRange()?.days.map((day) => day.tradingDate)).toEqual([
      '2026-08-05',
      '2026-08-06',
    ])
    expect(store.getRawData().map((item) => item.timestamp)).toEqual([1, 2, 3])
    expect(store.loadedWindow).toEqual({ earliestTs: 1, latestTs: 3 })
    expect(store.getLatestPreClose()).toBe(1500)
  })

  it('copies the input range and points at the storage boundary', () => {
    const input = range()
    const store = new TimeShareRangeStore()
    store.setRange(input)

    ;(input.days[0]!.data[0] as TimeShareData).price = 1

    expect(store.getRange()?.days[0]?.data[0]?.price).toBe(1500)
    expect(store.getRawData()[0]?.price).toBe(1500)
  })

  it('clears grouped metadata when legacy inline data replaces the range', () => {
    const store = new TimeShareRangeStore()
    store.setRange(range())
    store.setInlineData([point(4, 1530)])

    expect(store.getRange()).toBeNull()
    expect(store.range()).toBeNull()
    expect(store.getRawData()).toEqual([point(4, 1530)])
  })

  it('resets all stored projections and metadata', () => {
    const store = new TimeShareRangeStore()
    store.setRange(range())
    store.reset()

    expect(store.getRange()).toBeNull()
    expect(store.getRawData()).toEqual([])
    expect(store.loadedWindow).toBeNull()
    expect(store.data()).toEqual({ data: [], prependedCount: 0 })
  })
})
