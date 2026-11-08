/** 分时快照的去重、索引、发布原子性与查询状态。 */
import { describe, expect, it } from 'vitest'

import {
  createTimeShareDay,
  createTimeSharePoint,
} from '@/engine/__tests__/helpers/timeShareTestKit'
import { TimeShareBuffer } from '../buffer/impl/timeShareBuffer'

/** 分时 Buffer 只关心时间戳与点数值，其余字段取共享默认值。 */
function point(timestamp: number) {
  return createTimeSharePoint({ timestamp })
}

describe('TimeShareBuffer', () => {
  it('projects a single-day snapshot with last-write deduplication and unique indices', () => {
    const buffer = new TimeShareBuffer()
    const replacement = { ...point(2), price: 12 }
    buffer.setInlineData([point(1), point(2), replacement], 9.5)

    expect(buffer.getRawData()).toEqual([point(1), replacement])
    expect(buffer.getPreClose()).toBe(9.5)
    expect(buffer.getLogicalIndexAtTimestamp(1)).toBe(0)
    expect(buffer.getLogicalIndexAtTimestamp(2)).toBe(1)
    expect(buffer.getLogicalIndexAtTimestamp(3)).toBeNull()
  })

  it('projects a cache-provided multi-day snapshot atomically', () => {
    const buffer = new TimeShareBuffer()
    const published: number[][] = []
    const unsubscribe = buffer.data.subscribe(() => {
      published.push([
        buffer.getRawData().length,
        buffer.getRange()!.days.length,
        buffer.getPreClose()!,
        buffer.getLogicalIndexAtTimestamp(2)!,
      ])
    })
    buffer.setRange({
      instrumentId: 'test:BTCUSDT',
      timezone: 'UTC',
      requestedDays: 2,
      olderData: 'available',
      days: [
        createTimeShareDay({ tradingDate: '2026-09-01', preClose: 9, data: [{ timestamp: 1 }] }),
        createTimeShareDay({ tradingDate: '2026-09-02', preClose: 10, data: [{ timestamp: 2 }] }),
      ],
    })

    // 五日窗口统一取第一交易日昨收。
    expect(published).toEqual([[2, 2, 9, 1]])
    unsubscribe()
  })

  it('publishes query loading and errors without owning a fetcher', () => {
    const buffer = new TimeShareBuffer()
    buffer.setLoading(true)
    buffer.setError('unavailable')

    expect(buffer.loading()).toBe(false)
    expect(buffer.lastError()).toBe('unavailable')
  })
})
