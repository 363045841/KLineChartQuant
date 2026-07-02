import { describe, it, expect } from 'vitest'

import { createRenko } from '../renko'
import type { OHLCV } from '../types'

const bar = (i: number, o: number, h: number, l: number, c: number, v = 100): OHLCV => ({
  timestamp: 1_700_000_000_000 + i * 60_000,
  open: o,
  high: h,
  low: l,
  close: c,
  volume: v,
})

describe('renko', () => {
  it('rising prices emit up-bricks', () => {
    const r = createRenko()
    // Anchor at close 100, then push close up 30 (3 bricks of 10).
    const out = r.transform([bar(0, 100, 100, 100, 100), bar(1, 100, 130, 100, 130)], {
      brickSize: 10,
    })
    expect(out).toHaveLength(3)
    for (const b of out) {
      expect(b.meta?.direction).toBe('up')
      expect(b.close).toBeGreaterThan(b.open)
    }
    // Brick closes form a 10-unit ladder.
    expect(out[0]!.close - out[0]!.open).toBeCloseTo(10, 10)
    expect(out[2]!.close).toBeCloseTo(130, 10)
  })

  it('falling prices emit down-bricks', () => {
    const r = createRenko()
    const out = r.transform([bar(0, 100, 100, 100, 100), bar(1, 100, 100, 70, 70)], {
      brickSize: 10,
    })
    expect(out).toHaveLength(3)
    for (const b of out) {
      expect(b.meta?.direction).toBe('down')
      expect(b.close).toBeLessThan(b.open)
    }
    expect(out[2]!.close).toBeCloseTo(70, 10)
  })

  it('sideways prices within brickSize emit no bricks', () => {
    const r = createRenko()
    const out = r.transform(
      [
        bar(0, 100, 100, 100, 100),
        bar(1, 100, 105, 95, 103),
        bar(2, 103, 106, 98, 102),
        bar(3, 102, 109, 100, 108),
      ],
      { brickSize: 10 },
    )
    expect(out).toHaveLength(0)
  })

  it('reversal requires 2x brickSize after an up-brick', () => {
    const r = createRenko()
    // Anchor at 100, push up to 110 (one up-brick from 100->110).
    // Then a 1x brickSize move down (to 100) should NOT reverse.
    const out1 = r.transform(
      [bar(0, 100, 100, 100, 100), bar(1, 100, 110, 100, 110), bar(2, 110, 110, 100, 100)],
      { brickSize: 10 },
    )
    // Only the original up-brick should be emitted.
    expect(out1).toHaveLength(1)
    expect(out1[0]!.meta?.direction).toBe('up')

    // 2x brickSize move down DOES reverse (down to 90 = 110 - 20).
    const r2 = createRenko()
    const out2 = r2.transform(
      [bar(0, 100, 100, 100, 100), bar(1, 100, 110, 100, 110), bar(2, 110, 110, 90, 90)],
      { brickSize: 10 },
    )
    expect(out2.length).toBeGreaterThanOrEqual(2)
    expect(out2[0]!.meta?.direction).toBe('up')
    expect(out2[1]!.meta?.direction).toBe('down')
  })

  it('ATR mode produces brick size from rolling ATR (no bricks until window fills)', () => {
    const r = createRenko()
    // ATR period 3 — no bricks until the third bar's TR fills the window.
    const series: OHLCV[] = [
      bar(0, 100, 102, 99, 101),
      bar(1, 101, 103, 100, 102),
      bar(2, 102, 104, 101, 103),
      bar(3, 103, 120, 102, 119),
    ]
    const out = r.transform(series, { useATR: { period: 3 } })
    // After bar 3 the window has 4 TR values; brickSize is the rolling mean
    // of the last 3. Should emit at least one up-brick from the +16 move.
    expect(out.length).toBeGreaterThan(0)
    for (const b of out) {
      expect(b.meta?.direction).toBe('up')
      expect(b.meta?.brickSize).toBeGreaterThan(0)
    }
  })

  it('incremental mode matches batch mode on a random series', () => {
    let seed = 99
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    const series: OHLCV[] = []
    let price = 100
    for (let i = 0; i < 30; i++) {
      const drift = (rand() - 0.5) * 6
      const close = price + drift
      const high = Math.max(price, close) + rand() * 2
      const low = Math.min(price, close) - rand() * 2
      series.push(bar(i, price, high, low, close, Math.floor(rand() * 100)))
      price = close
    }
    const batch = createRenko().transform(series, { brickSize: 3 })
    const inc = createRenko()
    const incremental: ReturnType<typeof inc.transform> = []
    // Prime config via transform on empty array (sets activeConfig)…
    inc.transform([], { brickSize: 3 })
    for (const b of series) {
      for (const out of inc.appendBar!(b)) incremental.push(out)
    }
    expect(incremental.length).toBe(batch.length)
    for (let i = 0; i < batch.length; i++) {
      expect(batch[i]!.open).toBeCloseTo(incremental[i]!.open, 10)
      expect(batch[i]!.close).toBeCloseTo(incremental[i]!.close, 10)
      expect(batch[i]!.meta?.direction).toBe(incremental[i]!.meta?.direction)
    }
  })

  it('large gap close emits multiple bricks from one input bar', () => {
    const r = createRenko()
    const out = r.transform([bar(0, 100, 100, 100, 100), bar(1, 100, 200, 100, 200)], {
      brickSize: 10,
    })
    // 100 -> 200 across one bar should emit 10 up-bricks.
    expect(out).toHaveLength(10)
    // Only the first brick from that source bar carries its volume; the
    // rest are zero (see file header comment).
    expect(out[0]!.volume).toBe(100)
    expect(out[1]!.volume).toBe(0)
    expect(out[9]!.close).toBeCloseTo(200, 10)
  })

  it('empty input yields empty output', () => {
    const r = createRenko()
    const out = r.transform([], { brickSize: 5 })
    expect(out).toEqual([])
  })

  it('throws on invalid config', () => {
    expect(() => createRenko().transform([], { brickSize: 0 })).toThrow()
    expect(() => createRenko().transform([], {})).toThrow()
    expect(() => createRenko().transform([], { useATR: { period: 0 } })).toThrow()
  })

  it('reset() drops state so the next series starts fresh', () => {
    const r = createRenko()
    r.transform([bar(0, 100, 100, 100, 100), bar(1, 100, 150, 100, 150)], { brickSize: 10 })
    r.reset!()
    // After reset the next bar anchors the new series — no bricks yet.
    const out = r.appendBar!(bar(2, 200, 200, 200, 200))
    expect(out).toHaveLength(0)
  })
})
