import { describe, expect, it } from 'vitest'

import { TimeShareBuffer } from '../buffer/timeShareBuffer'

function point(timestamp: number) {
  return { timestamp, price: 10, average: 10, volume: 1 }
}

describe('TimeShareBuffer', () => {
  it('projects a cache-provided single-day snapshot', () => {
    const buffer = new TimeShareBuffer()
    buffer.setInlineData([point(1), point(2)], 9.5)

    expect(buffer.getRawData()).toHaveLength(2)
    expect(buffer.getPreClose()).toBe(9.5)
  })

  it('projects a cache-provided multi-day snapshot atomically', () => {
    const buffer = new TimeShareBuffer()
    buffer.setRange({
      instrumentId: 'test:BTCUSDT',
      timezone: 'UTC',
      requestedDays: 2,
      olderData: 'available',
      days: [
        { tradingDate: '2026-09-01', preClose: 9, data: [point(1)] },
        { tradingDate: '2026-09-02', preClose: 10, data: [point(2)] },
      ],
    })

    expect(buffer.getRange()?.days).toHaveLength(2)
    expect(buffer.getRawData()).toHaveLength(2)
    expect(buffer.getPreClose()).toBe(10)
  })

  it('resolves unique point timestamps and rejects duplicates', () => {
    const buffer = new TimeShareBuffer()
    buffer.setInlineData([point(1), point(2), point(2)], 9.5)

    expect(buffer.getLogicalIndexAtTimestamp(1)).toBe(0)
    expect(buffer.getLogicalIndexAtTimestamp(2)).toBeNull()
    expect(buffer.getLogicalIndexAtTimestamp(3)).toBeNull()
  })

  it('publishes query loading and errors without owning a fetcher', () => {
    const buffer = new TimeShareBuffer()
    buffer.setLoading(true)
    buffer.setError('unavailable')

    expect(buffer.loading()).toBe(false)
    expect(buffer.lastError()).toBe('unavailable')
  })
})
