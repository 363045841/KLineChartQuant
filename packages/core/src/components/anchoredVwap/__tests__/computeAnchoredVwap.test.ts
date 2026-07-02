/**
 * Tests for `computeAnchoredVwap` — pure math for Anchored VWAP + bands.
 *
 * The math the implementation is being held to:
 *
 *   typicalPrice(j) = (H[j] + L[j] + C[j]) / 3
 *   sumVwp(i)       = Σ_{j=a..i} typicalPrice(j) * V[j]
 *   sumVol(i)       = Σ_{j=a..i} V[j]
 *   AVWAP(i)        = sumVwp(i) / sumVol(i)
 *   sqDev(j)        = (typicalPrice(j) - AVWAP(j))^2 * V[j]    ← prevailing
 *   variance(i)     = Σ_{j=a..i} sqDev(j) / sumVol(i)
 *   stdDev(i)       = sqrt(variance(i))
 *   bands           = AVWAP ± k * stdDev, k ∈ {1, 2}
 *
 * The "prevailing AVWAP at j" subtlety is explicitly pinned by the test
 * `bands use prevailing AVWAP at j, not final AVWAP(i)` — that test would
 * fail with a naive implementation that uses the final AVWAP instead.
 */

import { describe, it, expect } from 'vitest'

import { isKLineChartError } from '../../../errors'
import { computeAnchoredVwap } from '../computeAnchoredVwap'
import type { AVWAPBar } from '../types'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Single-line bar constructor — keeps the fixtures readable. */
function bar(high: number, low: number, close: number, volume: number): AVWAPBar {
  return { high, low, close, volume }
}

/** typical price = (H + L + C) / 3 — used by the manual-formula tests. */
function tp(b: AVWAPBar): number {
  return (b.high + b.low + b.close) / 3
}

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('computeAnchoredVwap — edge cases', () => {
  it('returns [] when bars is empty', () => {
    // The "no data, no work" convention used by sibling controllers.
    // An out-of-range anchor on an empty array must NOT throw.
    expect(computeAnchoredVwap([], 0, true)).toEqual([])
    expect(computeAnchoredVwap([], -5, false)).toEqual([])
    expect(computeAnchoredVwap([], 999, true)).toEqual([])
  })

  // Post-BLOCKER-005: out-of-range throws are KLineChartError with code
  // `AVWAP_ANCHOR_OUT_OF_RANGE` (stronger contract than the previous
  // built-in RangeError — instanceof KLineChartError + code narrowing).
  it('throws KLineChartError(AVWAP_ANCHOR_OUT_OF_RANGE) when anchorIndex is negative', () => {
    const bars = [bar(100, 90, 95, 1000)]
    try {
      computeAnchoredVwap(bars, -1, true)
      throw new Error('expected throw')
    } catch (e) {
      expect(isKLineChartError(e, 'AVWAP_ANCHOR_OUT_OF_RANGE')).toBe(true)
    }
  })

  it('throws KLineChartError(AVWAP_ANCHOR_OUT_OF_RANGE) when anchorIndex >= bars.length', () => {
    const bars = [bar(100, 90, 95, 1000), bar(101, 91, 96, 1100)]
    for (const idx of [2, 10]) {
      try {
        computeAnchoredVwap(bars, idx, idx === 2)
        throw new Error('expected throw')
      } catch (e) {
        expect(isKLineChartError(e, 'AVWAP_ANCHOR_OUT_OF_RANGE')).toBe(true)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Core AVWAP math
// ---------------------------------------------------------------------------

describe('computeAnchoredVwap — core AVWAP math', () => {
  it('single-bar anchor: AVWAP equals that bar typical price; stdDev = 0', () => {
    const b0 = bar(100, 90, 95, 1000) // tp = 95
    const series = computeAnchoredVwap([b0], 0, true)
    expect(series).toHaveLength(1)
    const p0 = series[0]!
    expect(p0.barIndex).toBe(0)
    expect(p0.vwap).toBeCloseTo(95, 12)
    // stdDev is zero at the anchor when bands are requested → all four
    // bands equal the AVWAP exactly.
    expect(p0.upper1).toBeCloseTo(95, 12)
    expect(p0.lower1).toBeCloseTo(95, 12)
    expect(p0.upper2).toBeCloseTo(95, 12)
    expect(p0.lower2).toBeCloseTo(95, 12)
    expect(p0.cumulativeVolume).toBe(1000)
  })

  it('two bars: AVWAP[1] = (tp0*v0 + tp1*v1) / (v0 + v1)', () => {
    // tp0 = (100+90+95)/3 = 95, v0 = 1000  → vwp0 = 95_000
    // tp1 = (110+100+105)/3 = 105, v1 = 2000 → vwp1 = 210_000
    // AVWAP[1] = (95_000 + 210_000) / (1000 + 2000) = 305_000 / 3000
    const b0 = bar(100, 90, 95, 1000)
    const b1 = bar(110, 100, 105, 2000)
    const series = computeAnchoredVwap([b0, b1], 0, false)

    expect(series).toHaveLength(2)
    expect(series[0]!.vwap).toBeCloseTo(95, 12)
    const expected = (95 * 1000 + 105 * 2000) / (1000 + 2000)
    expect(series[1]!.vwap).toBeCloseTo(expected, 12)
    expect(series[1]!.cumulativeVolume).toBe(3000)
  })

  it('10-bar slowly trending up: AVWAP is monotonically non-decreasing', () => {
    // typical price rises by 1 per bar; constant volume.
    const bars: AVWAPBar[] = []
    for (let i = 0; i < 10; i++) {
      const t = 100 + i // tp ≈ 100, 101, 102, ...
      bars.push(bar(t + 1, t - 1, t, 100))
    }
    const series = computeAnchoredVwap(bars, 0, false)
    for (let i = 1; i < series.length; i++) {
      expect(series[i]!.vwap).toBeGreaterThanOrEqual(series[i - 1]!.vwap)
    }
    // Sanity bound: AVWAP must lie inside the trading range.
    expect(series[9]!.vwap).toBeGreaterThan(100)
    expect(series[9]!.vwap).toBeLessThan(110)
  })

  it('high-volume bar dominates the AVWAP toward its typical price', () => {
    // A massively oversized v on bar 2 should pull AVWAP toward tp(b2).
    const b0 = bar(101, 99, 100, 10) // tp = 100
    const b1 = bar(101, 99, 100, 10) // tp = 100
    const b2 = bar(201, 199, 200, 1_000_000) // tp = 200, huge V
    const series = computeAnchoredVwap([b0, b1, b2], 0, false)
    // After the whale bar, AVWAP should be >>> 100 and close to 200.
    expect(series[2]!.vwap).toBeGreaterThan(199)
    expect(series[2]!.vwap).toBeLessThan(200)
  })

  it('anchorIndex > 0 ignores bars before the anchor', () => {
    // Anchor at bar 2 → bars 0 and 1 must NOT contribute.
    const ignored = bar(1000, 1000, 1000, 1_000_000) // massive but ignored
    const b2 = bar(50, 50, 50, 100) // tp = 50
    const b3 = bar(60, 60, 60, 100) // tp = 60
    const series = computeAnchoredVwap([ignored, ignored, b2, b3], 2, false)
    expect(series).toHaveLength(2)
    expect(series[0]!.barIndex).toBe(2)
    expect(series[1]!.barIndex).toBe(3)
    expect(series[0]!.vwap).toBeCloseTo(50, 12)
    // AVWAP at bar 3 = (50*100 + 60*100)/(200) = 55
    expect(series[1]!.vwap).toBeCloseTo(55, 12)
  })
})

// ---------------------------------------------------------------------------
// Zero-volume handling
// ---------------------------------------------------------------------------

describe('computeAnchoredVwap — zero-volume handling', () => {
  it('zero-volume bar mid-series carries forward the prior AVWAP', () => {
    const b0 = bar(100, 100, 100, 1000) // tp = 100, vwap = 100
    const b1 = bar(150, 150, 150, 0) // v = 0 → carry forward
    const b2 = bar(110, 110, 110, 1000) // tp = 110
    const series = computeAnchoredVwap([b0, b1, b2], 0, false)

    expect(series).toHaveLength(3)
    // Point 0: vwap = 100.
    expect(series[0]!.vwap).toBeCloseTo(100, 12)
    // Point 1: sumVol unchanged → vwap is still 100 (carry forward).
    expect(series[1]!.vwap).toBeCloseTo(100, 12)
    expect(series[1]!.cumulativeVolume).toBe(1000)
    // Point 2: (100*1000 + 110*1000) / 2000 = 105
    expect(series[2]!.vwap).toBeCloseTo(105, 12)
    expect(series[2]!.cumulativeVolume).toBe(2000)
  })

  it('zero-volume anchor: first point is NaN, second is its own typical price', () => {
    const b0 = bar(100, 100, 100, 0) // anchor — v = 0
    const b1 = bar(200, 200, 200, 1000) // tp = 200
    const series = computeAnchoredVwap([b0, b1], 0, true)

    expect(series).toHaveLength(2)
    // Point 0: NaN everywhere; cumulativeVolume is still 0.
    expect(Number.isNaN(series[0]!.vwap)).toBe(true)
    expect(Number.isNaN(series[0]!.upper1)).toBe(true)
    expect(Number.isNaN(series[0]!.lower1)).toBe(true)
    expect(Number.isNaN(series[0]!.upper2)).toBe(true)
    expect(Number.isNaN(series[0]!.lower2)).toBe(true)
    expect(series[0]!.cumulativeVolume).toBe(0)
    // Point 1: sumVol becomes 1000 → vwap = tp(b1) = 200.
    expect(series[1]!.vwap).toBeCloseTo(200, 12)
    expect(series[1]!.cumulativeVolume).toBe(1000)
  })
})

// ---------------------------------------------------------------------------
// Bands
// ---------------------------------------------------------------------------

describe('computeAnchoredVwap — bands', () => {
  it('includeBands=false: upper1/lower1/upper2/lower2 all equal vwap', () => {
    const b0 = bar(100, 90, 95, 1000)
    const b1 = bar(110, 100, 105, 2000)
    const series = computeAnchoredVwap([b0, b1], 0, false)
    for (const p of series) {
      expect(p.upper1).toBe(p.vwap)
      expect(p.lower1).toBe(p.vwap)
      expect(p.upper2).toBe(p.vwap)
      expect(p.lower2).toBe(p.vwap)
    }
  })

  it('at the anchor stdDev = 0 → upper/lower bands equal AVWAP exactly', () => {
    const b0 = bar(101, 99, 100, 1000) // tp = 100
    const series = computeAnchoredVwap([b0], 0, true)
    expect(series[0]!.vwap).toBeCloseTo(100, 12)
    // Bands collapse onto the line because there is no deviation yet.
    expect(series[0]!.upper1).toBe(series[0]!.vwap)
    expect(series[0]!.lower1).toBe(series[0]!.vwap)
    expect(series[0]!.upper2).toBe(series[0]!.vwap)
    expect(series[0]!.lower2).toBe(series[0]!.vwap)
  })

  it('ascending series with constant volume: upper1 > vwap > lower1 monotonically (sanity)', () => {
    // Once dispersion appears (bar 1+), upper1 must strictly exceed
    // vwap and lower1 must strictly trail it.
    const bars: AVWAPBar[] = []
    for (let i = 0; i < 10; i++) {
      const t = 100 + i
      bars.push(bar(t, t, t, 100))
    }
    const series = computeAnchoredVwap(bars, 0, true)
    // Skip i = 0 (stdDev = 0). From i = 1 onward dispersion is positive.
    for (let i = 1; i < series.length; i++) {
      expect(series[i]!.upper1).toBeGreaterThan(series[i]!.vwap)
      expect(series[i]!.lower1).toBeLessThan(series[i]!.vwap)
      // 2σ envelope strictly contains 1σ envelope.
      expect(series[i]!.upper2).toBeGreaterThan(series[i]!.upper1)
      expect(series[i]!.lower2).toBeLessThan(series[i]!.lower1)
    }
  })

  it('bands use prevailing AVWAP at j, not final AVWAP(i)', () => {
    // Concrete 3-bar fixture engineered so the two formulas disagree
    // by a measurable amount. tp/v chosen to keep the arithmetic
    // verifiable by hand.
    //
    //   bar j   tp_j    v_j      AVWAP_j (prevailing)
    //     0    100     1000     100
    //     1    110     1000     105
    //     2    120     1000     110
    //
    //   sumVol  = 3000
    //   sumVwp  = 100_000 + 110_000 + 120_000 = 330_000
    //   AVWAP_2 = 110     (the "final" mean)
    //
    // CORRECT formula (prevailing AVWAP at j):
    //   sqDev(0) = (100 - 100)^2 * 1000 = 0
    //   sqDev(1) = (110 - 105)^2 * 1000 = 25_000
    //   sqDev(2) = (120 - 110)^2 * 1000 = 100_000
    //   sumSqDev = 125_000
    //   variance = 125_000 / 3_000 ≈ 41.6667
    //   stdDev   ≈ 6.4550
    //
    // WRONG formula (final AVWAP for every j):
    //   sqDev(0) = (100 - 110)^2 * 1000 = 100_000
    //   sqDev(1) = (110 - 110)^2 * 1000 = 0
    //   sqDev(2) = (120 - 110)^2 * 1000 = 100_000
    //   sumSqDev = 200_000
    //   variance = 200_000 / 3_000 ≈ 66.6667
    //   stdDev   ≈ 8.1650
    //
    // The two stdDevs differ by ~1.7 → upper1 differs by ~1.7. The
    // test pins the CORRECT value; a regression to the wrong formula
    // would fail loudly here.
    const b0 = bar(100, 100, 100, 1000)
    const b1 = bar(110, 110, 110, 1000)
    const b2 = bar(120, 120, 120, 1000)
    const series = computeAnchoredVwap([b0, b1, b2], 0, true)

    // Final AVWAP is 110 either way.
    expect(series[2]!.vwap).toBeCloseTo(110, 12)

    // Hand-computed using the prevailing-AVWAP rule.
    const expectedStdDev = Math.sqrt(125_000 / 3000)
    expect(series[2]!.upper1).toBeCloseTo(110 + expectedStdDev, 9)
    expect(series[2]!.lower1).toBeCloseTo(110 - expectedStdDev, 9)
    expect(series[2]!.upper2).toBeCloseTo(110 + 2 * expectedStdDev, 9)
    expect(series[2]!.lower2).toBeCloseTo(110 - 2 * expectedStdDev, 9)

    // Sanity: the WRONG-formula stdDev would be sqrt(200_000 / 3000).
    // If a regression switched to that formula, the assertion above
    // would fail by ~1.7 — well outside `toBeCloseTo(_, 9)`.
    const wrongStdDev = Math.sqrt(200_000 / 3000)
    expect(Math.abs(expectedStdDev - wrongStdDev)).toBeGreaterThan(1)
  })

  it('mixed-volume bars: bands match a hand-computed reference', () => {
    // Sanity check that the prevailing formula also handles uneven
    // volumes (the formula is variance-weighted, not equal-weighted).
    const b0 = bar(100, 100, 100, 1000) // tp = 100
    const b1 = bar(120, 120, 120, 3000) // tp = 120
    const series = computeAnchoredVwap([b0, b1], 0, true)

    // sumVwp = 100*1000 + 120*3000 = 460_000
    // sumVol = 4000
    // AVWAP[1] = 115
    expect(series[1]!.vwap).toBeCloseTo(115, 12)

    // sqDev(0): (100 - 100)^2 * 1000 = 0  (AVWAP_0 = 100, prevailing)
    // sqDev(1): (120 - 115)^2 * 3000 = 75_000
    // sumSqDev = 75_000
    // variance = 75_000 / 4000 = 18.75
    // stdDev = 4.330127...
    const stdDev = Math.sqrt(75_000 / 4000)
    expect(series[1]!.upper1).toBeCloseTo(115 + stdDev, 9)
    expect(series[1]!.lower1).toBeCloseTo(115 - stdDev, 9)
    // Use the locally-derived tp helper to avoid bit-rot: we want
    // the test to use the same tp formula the implementation does.
    expect(tp(b1)).toBe(120)
  })
})
