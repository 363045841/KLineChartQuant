import { describe, expect, it } from 'vitest'

import { createOrderBookState } from '../createOrderBookState'

describe('createOrderBookState', () => {
  it('applies a bid delta and reflects it in the next snapshot', () => {
    const book = createOrderBookState({ tickSize: 0.01 })
    book.applyDelta({ side: 'bid', price: 100.0, size: 5, timestamp: 1 })
    const snap = book.snapshot()
    expect(snap.bids).toEqual([[100.0, 5]])
    expect(snap.asks).toEqual([])
    expect(snap.timestamp).toBe(1)
  })

  it('treats size=0 as a removal of the level', () => {
    const book = createOrderBookState({ tickSize: 0.01 })
    book.applyDelta({ side: 'bid', price: 100.0, size: 5, timestamp: 1 })
    book.applyDelta({ side: 'bid', price: 100.0, size: 0, timestamp: 2 })
    const snap = book.snapshot()
    expect(snap.bids).toEqual([])
    expect(snap.timestamp).toBe(2)
  })

  it('quantizes input prices to ticks (67000.123 with tick 0.01 → 67000.12)', () => {
    const book = createOrderBookState({ tickSize: 0.01 })
    book.applyDelta({ side: 'ask', price: 67000.123, size: 1, timestamp: 1 })
    const snap = book.snapshot()
    expect(snap.asks).toHaveLength(1)
    expect(snap.asks[0][0]).toBeCloseTo(67000.12, 6)
    expect(snap.asks[0][1]).toBe(1)
  })

  it('returns dequantized prices (consumer never sees the tick index)', () => {
    const book = createOrderBookState({ tickSize: 0.5 })
    // 100.7 → tick 201 → 100.5
    book.applyDelta({ side: 'bid', price: 100.7, size: 3, timestamp: 1 })
    // 101.3 → tick 203 → 101.5
    book.applyDelta({ side: 'ask', price: 101.3, size: 4, timestamp: 1 })
    const snap = book.snapshot()
    expect(snap.bids).toEqual([[100.5, 3]])
    expect(snap.asks).toEqual([[101.5, 4]])
  })

  it('clear() resets both sides and the last timestamp', () => {
    const book = createOrderBookState({ tickSize: 0.01 })
    book.applyDelta({ side: 'bid', price: 100, size: 1, timestamp: 5 })
    book.applyDelta({ side: 'ask', price: 101, size: 2, timestamp: 6 })
    book.clear()
    const snap = book.snapshot()
    expect(snap.bids).toEqual([])
    expect(snap.asks).toEqual([])
    expect(snap.timestamp).toBe(0)
    expect(book.lastTimestamp()).toBe(0)
  })

  it('last update wins for the same price (multiple updates collapse)', () => {
    const book = createOrderBookState({ tickSize: 0.01 })
    book.applyDelta({ side: 'bid', price: 100, size: 1, timestamp: 1 })
    book.applyDelta({ side: 'bid', price: 100, size: 2, timestamp: 2 })
    book.applyDelta({ side: 'bid', price: 100, size: 9, timestamp: 3 })
    const snap = book.snapshot()
    expect(snap.bids).toEqual([[100.0, 9]])
    expect(snap.timestamp).toBe(3)
  })

  it('maintains bid and ask side independence', () => {
    const book = createOrderBookState({ tickSize: 0.01 })
    book.applyDelta({ side: 'bid', price: 100, size: 5, timestamp: 1 })
    book.applyDelta({ side: 'ask', price: 100, size: 7, timestamp: 2 })
    // Removing bid at 100 must not remove ask at 100.
    book.applyDelta({ side: 'bid', price: 100, size: 0, timestamp: 3 })
    const snap = book.snapshot()
    expect(snap.bids).toEqual([])
    expect(snap.asks).toEqual([[100, 7]])
  })

  it('sorts bids descending and asks ascending', () => {
    const book = createOrderBookState({ tickSize: 0.01 })
    book.applyDelta({ side: 'bid', price: 99.5, size: 1, timestamp: 1 })
    book.applyDelta({ side: 'bid', price: 100.0, size: 1, timestamp: 1 })
    book.applyDelta({ side: 'bid', price: 99.8, size: 1, timestamp: 1 })
    book.applyDelta({ side: 'ask', price: 101.0, size: 1, timestamp: 1 })
    book.applyDelta({ side: 'ask', price: 100.2, size: 1, timestamp: 1 })
    book.applyDelta({ side: 'ask', price: 100.5, size: 1, timestamp: 1 })
    const snap = book.snapshot()
    expect(snap.bids.map((b) => b[0])).toEqual([100.0, 99.8, 99.5])
    expect(snap.asks.map((a) => a[0])).toEqual([100.2, 100.5, 101.0])
  })

  it('respects maxLevels by truncating to top-of-book first', () => {
    const book = createOrderBookState({ tickSize: 0.01, maxLevels: 2 })
    book.applyDelta({ side: 'bid', price: 99.5, size: 1, timestamp: 1 })
    book.applyDelta({ side: 'bid', price: 100.0, size: 1, timestamp: 1 })
    book.applyDelta({ side: 'bid', price: 99.8, size: 1, timestamp: 1 })
    const snap = book.snapshot()
    expect(snap.bids.map((b) => b[0])).toEqual([100.0, 99.8])
  })

  it('rejects non-positive tickSize at construction', () => {
    expect(() => createOrderBookState({ tickSize: 0 })).toThrow()
    expect(() => createOrderBookState({ tickSize: -1 })).toThrow()
    expect(() => createOrderBookState({ tickSize: Infinity })).toThrow()
  })

  it('ignores NaN / Infinity deltas without corrupting state', () => {
    const book = createOrderBookState({ tickSize: 0.01 })
    book.applyDelta({ side: 'bid', price: NaN, size: 1, timestamp: 1 })
    book.applyDelta({ side: 'bid', price: 100, size: NaN, timestamp: 2 })
    book.applyDelta({ side: 'bid', price: 100, size: 1, timestamp: 3 })
    const snap = book.snapshot()
    expect(snap.bids).toEqual([[100, 1]])
  })
})
