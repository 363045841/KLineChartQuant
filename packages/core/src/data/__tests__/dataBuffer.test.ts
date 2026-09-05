import { describe, expect, it } from 'vitest'

import { DataBuffer } from '../buffer/dataBuffer'

function bar(timestamp: number) {
  return { timestamp, open: 1, high: 2, low: 0, close: 1, volume: 10 }
}

describe('DataBuffer', () => {
  it('only manages a chart snapshot when its symbol changes', () => {
    const buffer = new DataBuffer()
    buffer.setInlineData([bar(1)])

    buffer.setSymbol({ symbol: 'BTCUSDT', market: 'crypto', period: 'daily', source: 'test' })

    expect(buffer.getRawData()).toEqual([])
    expect(buffer.loading()).toBe(false)
    expect(buffer.currentSpec?.symbol).toBe('BTCUSDT')
  })

  it('merges cache pages and publishes the prepended count', () => {
    const buffer = new DataBuffer()
    buffer.setInlineData([bar(20), bar(30)])
    const changes: number[] = []
    const unsubscribe = buffer.data.subscribe(() => changes.push(buffer.data().prependedCount))

    buffer.mergeData([bar(10), bar(20)], 'available')

    expect(buffer.getRawData().map((item) => item.timestamp)).toEqual([10, 20, 30])
    expect(changes).toEqual([1])
    unsubscribe()
  })

  it('resolves logical indexes from its current timestamp index after prepending data', () => {
    const buffer = new DataBuffer()
    buffer.setInlineData([bar(20), bar(30)])

    buffer.mergeData([bar(10)], 'available')

    expect(buffer.getLogicalIndexAtTimestamp(20)).toBe(1)
    expect(buffer.getLogicalIndexAtTimestamp(30)).toBe(2)
    expect(buffer.getLogicalIndexAtTimestamp(99)).toBeNull()
  })

  it('rejects ambiguous inline timestamps instead of choosing an arbitrary index', () => {
    const buffer = new DataBuffer()
    buffer.setInlineData([bar(20), bar(20)])

    expect(buffer.getLogicalIndexAtTimestamp(20)).toBeNull()
  })

  it('publishes cache query loading and error state', () => {
    const buffer = new DataBuffer()
    buffer.setLoading(true)
    buffer.setError('upstream unavailable')

    expect(buffer.loading()).toBe(false)
    expect(buffer.lastError()).toBe('upstream unavailable')

    buffer.mergeData([bar(1)], 'available')
    expect(buffer.lastError()).toBeNull()
  })

  it('maintains calendar indexes for cache results', () => {
    const buffer = new DataBuffer()
    buffer.mergeData([bar(Date.UTC(2026, 0, 1)), bar(Date.UTC(2026, 1, 1))], 'available')

    expect(buffer.getMonthKeys()).toHaveLength(2)
    expect(buffer.getDayKeys()).toHaveLength(2)
  })
})
