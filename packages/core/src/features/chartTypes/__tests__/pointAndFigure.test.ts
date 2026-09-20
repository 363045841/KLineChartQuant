import { describe, expect, it } from 'vitest'

import { createPointAndFigure } from '../pointAndFigure'
import type { OHLCV, TransformedBar } from '../types'
import { createOhlcvBar } from './helpers/createOhlcvBar'

describe('pointAndFigure', () => {
  it('simple uptrend produces a single X column (batch includes in-progress)', () => {
    const pf = createPointAndFigure()
    const out = pf.transform(
      [
        createOhlcvBar(0, { open: 100, high: 100, low: 100, close: 100 }),
        createOhlcvBar(1, { open: 100, high: 110, low: 100, close: 110 }),
        createOhlcvBar(2, { open: 110, high: 120, low: 110, close: 120 }),
        createOhlcvBar(3, { open: 120, high: 130, low: 120, close: 130 }),
      ],
      { boxSize: 10, reversal: 3 },
    )
    expect(out).toHaveLength(1)
    expect(out[0]!.meta?.direction).toBe('up')
    expect(out[0]!.high).toBeGreaterThan(out[0]!.low)
  })

  it('a 3-box reversal closes the X column and opens an O column', () => {
    const pf = createPointAndFigure()
    const out = pf.transform(
      [
        createOhlcvBar(0, { open: 100, high: 100, low: 100, close: 100 }),
        createOhlcvBar(1, { open: 100, high: 130, low: 100, close: 130 }), // big X column up to 130
        createOhlcvBar(2, { open: 130, high: 130, low: 90, close: 90 }), // drops 40 (4 boxes), reversal of 3 met
      ],
      { boxSize: 10, reversal: 3 },
    )
    const directions = out.map((b) => b.meta?.direction)
    expect(directions).toContain('up')
    expect(directions).toContain('down')
    // First (closed) column is the X.
    expect(out[0]!.meta?.direction).toBe('up')
  })

  it('a 2-box reversal stays in the same X column (no flip)', () => {
    const pf = createPointAndFigure()
    const out = pf.transform(
      [
        createOhlcvBar(0, { open: 100, high: 100, low: 100, close: 100 }),
        createOhlcvBar(1, { open: 100, high: 130, low: 100, close: 130 }),
        createOhlcvBar(2, { open: 130, high: 130, low: 115, close: 115 }), // only 1.5 boxes down — below threshold
      ],
      { boxSize: 10, reversal: 3 },
    )
    // Only the in-progress X column should be present.
    expect(out).toHaveLength(1)
    expect(out[0]!.meta?.direction).toBe('up')
  })

  it('alternating chop emits multiple columns at the reversal threshold', () => {
    const pf = createPointAndFigure()
    const out = pf.transform(
      [
        createOhlcvBar(0, { open: 100, high: 100, low: 100, close: 100 }),
        createOhlcvBar(1, { open: 100, high: 130, low: 100, close: 130 }), // X up to 130
        createOhlcvBar(2, { open: 130, high: 130, low: 90, close: 90 }), // O down (reverse, 4 boxes)
        createOhlcvBar(3, { open: 90, high: 130, low: 90, close: 130 }), // X back up (reverse from O, 4 boxes)
        createOhlcvBar(4, { open: 130, high: 130, low: 90, close: 90 }), // O down again
      ],
      { boxSize: 10, reversal: 3 },
    )
    const closed = out.filter((b) => b.sourceBarIndexEnd < 4)
    // Expect at least 3 alternating-direction closed columns.
    expect(closed.length).toBeGreaterThanOrEqual(3)
    const dirs = closed.map((b) => b.meta?.direction)
    // No two consecutive closed columns have the same direction.
    for (let i = 1; i < dirs.length; i++) {
      expect(dirs[i]).not.toBe(dirs[i - 1])
    }
  })

  it('first bar seeds an X column with low/high snapped to box boundaries', () => {
    const pf = createPointAndFigure()
    const out = pf.transform([createOhlcvBar(0, { open: 103, high: 117, low: 102, close: 115 })], {
      boxSize: 5,
      reversal: 3,
    })
    expect(out).toHaveLength(1)
    // low 102 -> 100 (floor of 5), high 117 -> 115 (floor of 5).
    expect(out[0]!.low).toBeCloseTo(100, 10)
    expect(out[0]!.high).toBeCloseTo(115, 10)
    expect(out[0]!.meta?.direction).toBe('up')
  })

  it('column open and close match the column endpoints', () => {
    const pf = createPointAndFigure()
    const out = pf.transform(
      [
        createOhlcvBar(0, { open: 100, high: 100, low: 100, close: 100 }),
        createOhlcvBar(1, { open: 100, high: 130, low: 100, close: 130 }),
      ],
      {
        boxSize: 10,
        reversal: 3,
      },
    )
    const col = out[0]!
    // X column: open = start price, close = end price = high.
    expect(col.open).toBeLessThanOrEqual(col.close)
    expect(col.close).toBe(col.high)
  })

  it('reversal exactly at threshold triggers a flip (>=, not >)', () => {
    const pf = createPointAndFigure()
    const out = pf.transform(
      [
        createOhlcvBar(0, { open: 100, high: 100, low: 100, close: 100 }),
        createOhlcvBar(1, { open: 100, high: 130, low: 100, close: 130 }),
        createOhlcvBar(2, { open: 130, high: 130, low: 100, close: 100 }), // exactly 3 boxes (30) down — at threshold
      ],
      { boxSize: 10, reversal: 3 },
    )
    const dirs = out.map((b) => b.meta?.direction)
    expect(dirs).toContain('up')
    expect(dirs).toContain('down')
  })

  it('empty input yields empty output', () => {
    const pf = createPointAndFigure()
    const out = pf.transform([], { boxSize: 10, reversal: 3 })
    expect(out).toEqual([])
  })

  it('throws on invalid config', () => {
    expect(() => createPointAndFigure().transform([], { boxSize: 0, reversal: 3 })).toThrow()
    expect(() => createPointAndFigure().transform([], { boxSize: 10, reversal: 0 })).toThrow()
  })

  it('incremental closed columns match batch closed columns', () => {
    const series: OHLCV[] = [
      createOhlcvBar(0, { open: 100, high: 100, low: 100, close: 100 }),
      createOhlcvBar(1, { open: 100, high: 130, low: 100, close: 130 }),
      createOhlcvBar(2, { open: 130, high: 130, low: 90, close: 90 }),
      createOhlcvBar(3, { open: 90, high: 130, low: 90, close: 130 }),
      createOhlcvBar(4, { open: 130, high: 130, low: 100, close: 100 }),
      createOhlcvBar(5, { open: 100, high: 140, low: 100, close: 140 }),
    ]
    const batch = createPointAndFigure().transform(series, { boxSize: 10, reversal: 3 })
    const inc = createPointAndFigure()
    inc.transform([], { boxSize: 10, reversal: 3 })
    const incremental: TransformedBar[] = []
    for (const b of series) {
      for (const out of inc.appendBar!(b)) incremental.push(out)
    }
    // Batch may include a final in-progress column. Compare CLOSED prefix.
    const batchClosed = batch.slice(0, incremental.length)
    expect(incremental.length).toBe(batchClosed.length)
    for (let i = 0; i < batchClosed.length; i++) {
      expect(batchClosed[i]!.open).toBeCloseTo(incremental[i]!.open, 10)
      expect(batchClosed[i]!.close).toBeCloseTo(incremental[i]!.close, 10)
      expect(batchClosed[i]!.meta?.direction).toBe(incremental[i]!.meta?.direction)
    }
  })

  it('reset() returns to a seed state', () => {
    const pf = createPointAndFigure()
    pf.transform([createOhlcvBar(0, { open: 100, high: 130, low: 100, close: 130 })], {
      boxSize: 10,
      reversal: 3,
    })
    pf.reset!()
    const out = pf.appendBar!(createOhlcvBar(1, { open: 200, high: 215, low: 200, close: 215 }))
    // No closed columns yet; in-progress is now an X anchored at 200/215.
    expect(out).toEqual([])
  })
})
