/**
 * resampleBars tests — bucketing math, partial bars, gap handling.
 */

import { describe, it, expect } from 'vitest'

import { resampleBars } from '../resampleBars'
import type { BaseBar } from '../types'

const min = 60_000
const hour = 60 * min

function bar(tsMs: number, o: number, h: number, l: number, c: number, v = 100): BaseBar {
  return { timestamp: tsMs, open: o, high: h, low: l, close: c, volume: v }
}

describe('resampleBars — input validation', () => {
  it('throws when targetIntervalMs is not a multiple of baseIntervalMs', () => {
    // 1.5 min is not an integer multiple of 1 min
    expect(() => resampleBars([], min, min + 30_000)).toThrow(/integer multiple/)
  })

  it('throws on non-positive intervals', () => {
    expect(() => resampleBars([], 0, hour)).toThrow(/positive/)
    expect(() => resampleBars([], min, -hour)).toThrow(/positive/)
  })

  it('returns [] for empty input', () => {
    expect(resampleBars([], min, hour)).toEqual([])
  })

  it('targetIntervalMs === baseIntervalMs returns 1-to-1 wrapped bars', () => {
    const bars = [bar(0, 1, 2, 0.5, 1.5), bar(min, 1.5, 3, 1, 2)]
    const out = resampleBars(bars, min, min)
    expect(out).toHaveLength(2)
    expect(out[0]!.sourceStart).toBe(0)
    expect(out[0]!.sourceEnd).toBe(0)
    expect(out[0]!.open).toBe(1)
    expect(out[1]!.sourceStart).toBe(1)
  })
})

describe('resampleBars — aggregation rules', () => {
  it('60 1m bars → 1 1h bar with correct OHLCV', () => {
    const bars: BaseBar[] = []
    for (let i = 0; i < 60; i++) {
      bars.push(bar(i * min, 100 + i, 101 + i, 99 + i, 100 + i + 0.5, 10))
    }
    const out = resampleBars(bars, min, hour)
    expect(out).toHaveLength(1)
    expect(out[0]!.open).toBe(100)
    expect(out[0]!.close).toBe(159.5)
    expect(out[0]!.high).toBe(160) // 101 + 59
    expect(out[0]!.low).toBe(99)
    expect(out[0]!.volume).toBe(600)
    expect(out[0]!.sourceStart).toBe(0)
    expect(out[0]!.sourceEnd).toBe(59)
  })

  it('60 1m bars → 12 5m bars', () => {
    const bars: BaseBar[] = []
    for (let i = 0; i < 60; i++) {
      bars.push(bar(i * min, 100, 101, 99, 100, 10))
    }
    const out = resampleBars(bars, min, 5 * min)
    expect(out).toHaveLength(12)
    for (const b of out) {
      expect(b.volume).toBe(50)
      expect(b.sourceEnd - b.sourceStart + 1).toBe(5)
    }
  })

  it('partial final bucket is emitted (forming-bar visibility)', () => {
    // 65 1m bars → 1 full 1h + 1 partial 1h (5 minutes)
    const bars: BaseBar[] = []
    for (let i = 0; i < 65; i++) {
      bars.push(bar(i * min, 100, 101, 99, 100, 10))
    }
    const out = resampleBars(bars, min, hour)
    expect(out).toHaveLength(2)
    expect(out[1]!.sourceStart).toBe(60)
    expect(out[1]!.sourceEnd).toBe(64)
    expect(out[1]!.volume).toBe(50)
  })

  it('single base bar produces a single (partial) output bar', () => {
    const out = resampleBars([bar(0, 1, 2, 0.5, 1.5)], min, hour)
    expect(out).toHaveLength(1)
    expect(out[0]!.sourceStart).toBe(0)
    expect(out[0]!.sourceEnd).toBe(0)
  })

  it('input gap does not create a synthetic bucket; the missing minute is just absent', () => {
    // 09:30, 09:31, [skip 09:32], 09:33, 09:34 → all fold into the same 5m bucket starting 09:30
    const bars = [
      bar(0, 100, 100, 100, 100, 10),
      bar(min, 100, 100, 100, 100, 10),
      bar(3 * min, 100, 100, 100, 100, 10),
      bar(4 * min, 100, 100, 100, 100, 10),
    ]
    const out = resampleBars(bars, min, 5 * min)
    expect(out).toHaveLength(1)
    expect(out[0]!.volume).toBe(40) // 4 bars × 10
    expect(out[0]!.sourceStart).toBe(0)
    expect(out[0]!.sourceEnd).toBe(3)
  })
})
