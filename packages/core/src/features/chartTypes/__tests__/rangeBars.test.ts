import { describe, expect, it } from 'vitest'

import { createRangeBars } from '../impl/rangeBars'
import type { OHLCV, TransformedBar } from '../types'
import { createOhlcvBar } from './helpers/createOhlcvBar'

describe('rangeBars', () => {
  it('simple trending input produces range bars whose span = range', () => {
    const r = createRangeBars()
    const out = r.transform(
      [
        createOhlcvBar(0, { open: 100, high: 102, low: 99, close: 101 }),
        createOhlcvBar(1, { open: 101, high: 105, low: 100, close: 104 }),
        createOhlcvBar(2, { open: 104, high: 110, low: 103, close: 109 }),
        createOhlcvBar(3, { open: 109, high: 115, low: 108, close: 114 }),
      ],
      { range: 5 },
    )
    // The closed bars must each have span === 5 (within fp tolerance).
    const closedBars = out.slice(0, -1)
    for (const b of closedBars) {
      expect(b.high - b.low).toBeCloseTo(5, 8)
    }
  })

  it('sideways input within range emits no closed bars', () => {
    const r = createRangeBars()
    const out = r.transform(
      [
        createOhlcvBar(0, { open: 100, high: 101, low: 99, close: 100 }),
        createOhlcvBar(1, { open: 100, high: 102, low: 99, close: 101 }),
        createOhlcvBar(2, { open: 101, high: 102, low: 99, close: 100 }),
      ],
      { range: 10 },
    )
    // Only the in-progress bar should be present.
    expect(out).toHaveLength(1)
  })

  it('first bar establishes the first range', () => {
    const r = createRangeBars()
    const out = r.transform([createOhlcvBar(0, { open: 100, high: 101, low: 99, close: 100 })], {
      range: 10,
    })
    expect(out).toHaveLength(1)
    expect(out[0]!.open).toBe(100)
  })

  it('input bar exceeding range splits into multiple output bars', () => {
    const r = createRangeBars()
    // A wide input bar spanning 50 units with range 10 should split into ~5 bars.
    const out = r.transform([createOhlcvBar(0, { open: 100, high: 150, low: 100, close: 150 })], {
      range: 10,
    })
    const closed = out.filter((b) => Math.abs(b.high - b.low - 10) < 1e-6)
    expect(closed.length).toBeGreaterThanOrEqual(4)
  })

  it('exact-range boundary triggers immediate close', () => {
    const r = createRangeBars()
    // Single bar with H - L == 10 exactly.
    const out = r.transform([createOhlcvBar(0, { open: 100, high: 110, low: 100, close: 110 })], {
      range: 10,
    })
    // At least one bar must have closed.
    const closed = out.filter((_, i, arr) => i < arr.length - 1)
    expect(closed.length).toBeGreaterThanOrEqual(1)
  })

  it('volume is aggregated across input bars within one range bar', () => {
    const r = createRangeBars()
    // Three sideways bars accumulate into one open range bar.
    const out = r.transform(
      [
        createOhlcvBar(0, { open: 100, high: 101, low: 99, close: 100, volume: 50 }),
        createOhlcvBar(1, { open: 100, high: 102, low: 99, close: 101, volume: 60 }),
        createOhlcvBar(2, { open: 101, high: 102, low: 99, close: 100, volume: 70 }),
      ],
      { range: 10 },
    )
    // The only present bar (the open one) should hold the summed volume.
    expect(out).toHaveLength(1)
    expect(out[0]!.volume).toBe(50 + 60 + 70)
  })

  it('split input bar distributes volume proportionally (no spike on first)', () => {
    const r = createRangeBars()
    const out = r.transform(
      [createOhlcvBar(0, { open: 100, high: 150, low: 100, close: 150, volume: 500 })],
      { range: 10 },
    )
    const closed = out.slice(0, -1)
    expect(closed.length).toBeGreaterThan(1)
    // No single closed bar should hold all the volume.
    for (const b of closed) {
      expect(b.volume).toBeLessThan(500)
    }
    // The sum across closed + open should not exceed the input volume.
    const total = out.reduce((s, b) => s + b.volume, 0)
    expect(total).toBeLessThanOrEqual(500 + 1e-6)
  })

  it('empty input yields empty output', () => {
    const r = createRangeBars()
    const out = r.transform([], { range: 5 })
    expect(out).toEqual([])
  })

  it('throws on invalid range', () => {
    expect(() => createRangeBars().transform([], { range: 0 })).toThrow()
    expect(() => createRangeBars().transform([], { range: -1 })).toThrow()
  })

  it('incremental closed bars match batch closed bars on a random series', () => {
    let seed = 7
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    const series: OHLCV[] = []
    let price = 100
    for (let i = 0; i < 30; i++) {
      const drift = (rand() - 0.5) * 4
      const close = price + drift
      const high = Math.max(price, close) + rand() * 1.5
      const low = Math.min(price, close) - rand() * 1.5
      series.push(
        createOhlcvBar(i, { open: price, high, low, close, volume: Math.floor(rand() * 100) }),
      )
      price = close
    }
    const batch = createRangeBars().transform(series, { range: 3 })
    const inc = createRangeBars()
    inc.transform([], { range: 3 })
    const incremental: TransformedBar[] = []
    for (const b of series) {
      for (const out of inc.appendBar!(b)) incremental.push(out)
    }
    // Batch includes the final in-progress bar. Compare closed prefix.
    const batchClosed = batch.slice(0, incremental.length)
    expect(incremental.length).toBe(batchClosed.length)
    for (let i = 0; i < batchClosed.length; i++) {
      expect(batchClosed[i]!.open).toBeCloseTo(incremental[i]!.open, 8)
      expect(batchClosed[i]!.close).toBeCloseTo(incremental[i]!.close, 8)
      // Span equals range within fp tolerance for every closed bar.
      expect(Math.abs(incremental[i]!.high - incremental[i]!.low - 3)).toBeLessThan(1e-6)
    }
  })

  it('reset() drops state so the next series starts clean', () => {
    const r = createRangeBars()
    r.transform([createOhlcvBar(0, { open: 100, high: 110, low: 100, close: 110 })], { range: 10 })
    r.reset!()
    const out = r.appendBar!(createOhlcvBar(1, { open: 200, high: 201, low: 199, close: 200 }))
    // First post-reset bar should not have closed anything (range not met).
    expect(out).toEqual([])
  })
})
