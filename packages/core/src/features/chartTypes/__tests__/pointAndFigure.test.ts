import { describe, it, expect } from 'vitest'

import { createPointAndFigure } from '../pointAndFigure'
import type { OHLCV } from '../types'

const bar = (i: number, o: number, h: number, l: number, c: number, v = 100): OHLCV => ({
  timestamp: 1_700_000_000_000 + i * 60_000,
  open: o,
  high: h,
  low: l,
  close: c,
  volume: v,
})

describe('pointAndFigure', () => {
  it('simple uptrend produces a single X column (batch includes in-progress)', () => {
    const pf = createPointAndFigure()
    const out = pf.transform(
      [
        bar(0, 100, 100, 100, 100),
        bar(1, 100, 110, 100, 110),
        bar(2, 110, 120, 110, 120),
        bar(3, 120, 130, 120, 130),
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
        bar(0, 100, 100, 100, 100),
        bar(1, 100, 130, 100, 130), // big X column up to 130
        bar(2, 130, 130, 90, 90), // drops 40 (4 boxes), reversal of 3 met
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
        bar(0, 100, 100, 100, 100),
        bar(1, 100, 130, 100, 130),
        bar(2, 130, 130, 115, 115), // only 1.5 boxes down — below threshold
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
        bar(0, 100, 100, 100, 100),
        bar(1, 100, 130, 100, 130), // X up to 130
        bar(2, 130, 130, 90, 90), // O down (reverse, 4 boxes)
        bar(3, 90, 130, 90, 130), // X back up (reverse from O, 4 boxes)
        bar(4, 130, 130, 90, 90), // O down again
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
    const out = pf.transform([bar(0, 103, 117, 102, 115)], { boxSize: 5, reversal: 3 })
    expect(out).toHaveLength(1)
    // low 102 -> 100 (floor of 5), high 117 -> 115 (floor of 5).
    expect(out[0]!.low).toBeCloseTo(100, 10)
    expect(out[0]!.high).toBeCloseTo(115, 10)
    expect(out[0]!.meta?.direction).toBe('up')
  })

  it('column open and close match the column endpoints', () => {
    const pf = createPointAndFigure()
    const out = pf.transform([bar(0, 100, 100, 100, 100), bar(1, 100, 130, 100, 130)], {
      boxSize: 10,
      reversal: 3,
    })
    const col = out[0]!
    // X column: open = start price, close = end price = high.
    expect(col.open).toBeLessThanOrEqual(col.close)
    expect(col.close).toBe(col.high)
  })

  it('reversal exactly at threshold triggers a flip (>=, not >)', () => {
    const pf = createPointAndFigure()
    const out = pf.transform(
      [
        bar(0, 100, 100, 100, 100),
        bar(1, 100, 130, 100, 130),
        bar(2, 130, 130, 100, 100), // exactly 3 boxes (30) down — at threshold
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
      bar(0, 100, 100, 100, 100),
      bar(1, 100, 130, 100, 130),
      bar(2, 130, 130, 90, 90),
      bar(3, 90, 130, 90, 130),
      bar(4, 130, 130, 100, 100),
      bar(5, 100, 140, 100, 140),
    ]
    const batch = createPointAndFigure().transform(series, { boxSize: 10, reversal: 3 })
    const inc = createPointAndFigure()
    inc.transform([], { boxSize: 10, reversal: 3 })
    const incremental: ReturnType<typeof inc.transform> = []
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
    pf.transform([bar(0, 100, 130, 100, 130)], { boxSize: 10, reversal: 3 })
    pf.reset!()
    const out = pf.appendBar!(bar(1, 200, 215, 200, 215))
    // No closed columns yet; in-progress is now an X anchored at 200/215.
    expect(out).toEqual([])
  })
})
