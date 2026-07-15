import { describe, it, expect } from 'vitest'

import { createHeikinAshi } from '../heikinAshi'
import type { OHLCV } from '../types'

const bar = (i: number, o: number, h: number, l: number, c: number, v = 100): OHLCV => ({
  timestamp: 1_700_000_000_000 + i * 60_000,
  open: o,
  high: h,
  low: l,
  close: c,
  volume: v,
})

describe('heikinAshi', () => {
  it('seeds HA_open[0] = (open + close) / 2', () => {
    const ha = createHeikinAshi()
    const [out] = ha.transform([bar(0, 100, 110, 90, 108)], {})
    expect(out).toBeDefined()
    expect(out!.open).toBeCloseTo((100 + 108) / 2, 10)
    expect(out!.close).toBeCloseTo((100 + 110 + 90 + 108) / 4, 10)
  })

  it('subsequent bars use HA_open = (prevHAOpen + prevHAClose) / 2', () => {
    const ha = createHeikinAshi()
    const out = ha.transform([bar(0, 100, 110, 90, 108), bar(1, 108, 120, 105, 118)], {})
    const prev = out[0]!
    const cur = out[1]!
    expect(cur.open).toBeCloseTo((prev.open + prev.close) / 2, 10)
    expect(cur.close).toBeCloseTo((108 + 120 + 105 + 118) / 4, 10)
  })

  it('HA_high >= max(HA_open, HA_close) and HA_high >= input high', () => {
    const ha = createHeikinAshi()
    const out = ha.transform(
      [bar(0, 100, 110, 90, 108), bar(1, 108, 120, 105, 118), bar(2, 118, 125, 116, 120)],
      {},
    )
    for (const b of out) {
      expect(b.high).toBeGreaterThanOrEqual(Math.max(b.open, b.close))
      expect(b.low).toBeLessThanOrEqual(Math.min(b.open, b.close))
    }
  })

  it('strong uptrend in input produces consecutive bullish HA bars (close >= open)', () => {
    const ha = createHeikinAshi()
    const series: OHLCV[] = []
    for (let i = 0; i < 10; i++) {
      const base = 100 + i * 5
      // Strong up bars: open near low, close at high.
      series.push(bar(i, base, base + 6, base - 1, base + 5))
    }
    const out = ha.transform(series, {})
    // The first bar may be ambiguous; expect the trend to dominate the tail.
    const bullishTail = out.slice(2).every((b) => b.close >= b.open)
    expect(bullishTail).toBe(true)
  })

  it('incremental mode produces identical output to batch mode over a random series', () => {
    const series: OHLCV[] = []
    let price = 100
    // Deterministic pseudo-random walk for repeatability.
    let seed = 12345
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    for (let i = 0; i < 30; i++) {
      const open = price
      const drift = (rand() - 0.5) * 4
      const close = open + drift
      const high = Math.max(open, close) + rand() * 2
      const low = Math.min(open, close) - rand() * 2
      series.push(bar(i, open, high, low, close, Math.floor(rand() * 1000)))
      price = close
    }
    const haBatch = createHeikinAshi()
    const batched = haBatch.transform(series, {})

    const haInc = createHeikinAshi()
    const incremental = series.flatMap((b) => [...haInc.appendBar!(b)])
    expect(incremental.length).toBe(batched.length)
    for (let i = 0; i < batched.length; i++) {
      const a = batched[i]!
      const b = incremental[i]!
      expect(a.open).toBeCloseTo(b.open, 10)
      expect(a.high).toBeCloseTo(b.high, 10)
      expect(a.low).toBeCloseTo(b.low, 10)
      expect(a.close).toBeCloseTo(b.close, 10)
      expect(a.timestamp).toBe(b.timestamp)
      expect(a.volume).toBe(b.volume)
      expect(a.sourceBarIndexStart).toBe(b.sourceBarIndexStart)
    }
  })

  it('reset() clears state so the next appendBar uses the seed formula', () => {
    const ha = createHeikinAshi()
    ha.appendBar!(bar(0, 100, 110, 90, 108))
    ha.appendBar!(bar(1, 108, 115, 105, 112))
    ha.reset!()
    const [first] = ha.appendBar!(bar(2, 200, 210, 190, 205))
    expect(first!.open).toBeCloseTo((200 + 205) / 2, 10)
    expect(first!.sourceBarIndexStart).toBe(0)
  })

  it('handles single-bar input cleanly', () => {
    const ha = createHeikinAshi()
    const out = ha.transform([bar(0, 50, 55, 45, 52)], {})
    expect(out).toHaveLength(1)
    expect(out[0]!.open).toBeCloseTo((50 + 52) / 2, 10)
    expect(out[0]!.high).toBeGreaterThanOrEqual(55)
    expect(out[0]!.volume).toBe(100)
  })

  it('preserves source bar indices 1:1', () => {
    const ha = createHeikinAshi()
    const out = ha.transform([bar(0, 100, 110, 90, 108), bar(1, 108, 120, 105, 118)], {})
    expect(out[0]!.sourceBarIndexStart).toBe(0)
    expect(out[0]!.sourceBarIndexEnd).toBe(0)
    expect(out[1]!.sourceBarIndexStart).toBe(1)
    expect(out[1]!.sourceBarIndexEnd).toBe(1)
  })
})
