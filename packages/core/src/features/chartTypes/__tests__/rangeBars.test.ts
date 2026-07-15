import { describe, it, expect } from 'vitest'

import { createRangeBars } from '../rangeBars'
import type { OHLCV } from '../types'

const bar = (i: number, o: number, h: number, l: number, c: number, v = 100): OHLCV => ({
  timestamp: 1_700_000_000_000 + i * 60_000,
  open: o,
  high: h,
  low: l,
  close: c,
  volume: v,
})

describe('rangeBars', () => {
  it('simple trending input produces range bars whose span = range', () => {
    const r = createRangeBars()
    const out = r.transform(
      [
        bar(0, 100, 102, 99, 101),
        bar(1, 101, 105, 100, 104),
        bar(2, 104, 110, 103, 109),
        bar(3, 109, 115, 108, 114),
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
      [bar(0, 100, 101, 99, 100), bar(1, 100, 102, 99, 101), bar(2, 101, 102, 99, 100)],
      { range: 10 },
    )
    // Only the in-progress bar should be present.
    expect(out).toHaveLength(1)
  })

  it('first bar establishes the first range', () => {
    const r = createRangeBars()
    const out = r.transform([bar(0, 100, 101, 99, 100)], { range: 10 })
    expect(out).toHaveLength(1)
    expect(out[0]!.open).toBe(100)
  })

  it('input bar exceeding range splits into multiple output bars', () => {
    const r = createRangeBars()
    // A wide input bar spanning 50 units with range 10 should split into ~5 bars.
    const out = r.transform([bar(0, 100, 150, 100, 150)], { range: 10 })
    const closed = out.filter((b) => Math.abs(b.high - b.low - 10) < 1e-6)
    expect(closed.length).toBeGreaterThanOrEqual(4)
  })

  it('exact-range boundary triggers immediate close', () => {
    const r = createRangeBars()
    // Single bar with H - L == 10 exactly.
    const out = r.transform([bar(0, 100, 110, 100, 110)], { range: 10 })
    // At least one bar must have closed.
    const closed = out.filter((_, i, arr) => i < arr.length - 1)
    expect(closed.length).toBeGreaterThanOrEqual(1)
  })

  it('volume is aggregated across input bars within one range bar', () => {
    const r = createRangeBars()
    // Three sideways bars accumulate into one open range bar.
    const out = r.transform(
      [bar(0, 100, 101, 99, 100, 50), bar(1, 100, 102, 99, 101, 60), bar(2, 101, 102, 99, 100, 70)],
      { range: 10 },
    )
    // The only present bar (the open one) should hold the summed volume.
    expect(out).toHaveLength(1)
    expect(out[0]!.volume).toBe(50 + 60 + 70)
  })

  it('split input bar distributes volume proportionally (no spike on first)', () => {
    const r = createRangeBars()
    const out = r.transform([bar(0, 100, 150, 100, 150, 500)], { range: 10 })
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
      series.push(bar(i, price, high, low, close, Math.floor(rand() * 100)))
      price = close
    }
    const batch = createRangeBars().transform(series, { range: 3 })
    const inc = createRangeBars()
    inc.transform([], { range: 3 })
    const incremental: ReturnType<typeof inc.transform> = []
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
    r.transform([bar(0, 100, 110, 100, 110)], { range: 10 })
    r.reset!()
    const out = r.appendBar!(bar(1, 200, 201, 199, 200))
    // First post-reset bar should not have closed anything (range not met).
    expect(out).toEqual([])
  })
})
