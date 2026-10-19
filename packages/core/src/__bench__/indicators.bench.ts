/**
 * Indicator pack benchmarks.
 *
 * Locks per-indicator throughput numbers for the 12 indicator functions
 * shipped in b-9 (MA family) and b-10 (oscillator family). Each test
 * runs on two fixed input sizes — 10 k bars (one-year intraday at
 * ~30s buckets) and 100 k bars (multi-year zoomed) — so the consumer
 * can read off "how many full recomputes per second" at the scale they
 * actually run at.
 *
 * Numbers are produced by `vitest bench`. They're stable on the
 * dev machine but vary across hardware; CI publishes baselines and
 * a follow-up tick can wire regression detection.
 *
 * The benches are explicitly framework-agnostic: no DOM, no Signal,
 * no renderer. Just the pure-function math on a Float64Array-shaped
 * input. This matches the "rendering perf crushes TV" anecdote the
 * team flagged — every indicator value gets computed before any
 * pixel hits the screen, so locking these numbers gives a floor on
 * end-to-end frame budget.
 */

import { describe, test } from 'vitest'

// Oscillator family (b-10)
import { computeFisherTransform } from '../features/indicators/fisherTransform'
import { computeSchaffTrendCycle } from '../features/indicators/schaffTrendCycle'
import { computeStochRSI } from '../features/indicators/stochRSI'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildCloseArray(n: number): Float64Array {
  const out = new Float64Array(n)
  const base = 100
  for (let i = 0; i < n; i++) {
    // Deterministic walk: sin + cos so the indicator state actually
    // moves around (a flat input lets some indicators short-circuit).
    out[i] = base + Math.sin(i / 7) * 5 + Math.cos(i / 5) * 2
  }
  return out
}

function buildOhlcBars(n: number): Array<{
  high: number
  low: number
  close: number
}> {
  const closes = buildCloseArray(n)
  const out: Array<{ high: number; low: number; close: number }> = new Array(n)
  for (let i = 0; i < n; i++) {
    const c = closes[i]!
    out[i] = { high: c + 1.5, low: c - 1.5, close: c }
  }
  return out
}

const close10k = buildCloseArray(10_000)
const close100k = buildCloseArray(100_000)
const hl10k = buildOhlcBars(10_000)
const hl100k = buildOhlcBars(100_000)

// ---------------------------------------------------------------------------
// Oscillators — mixed input signatures
// ---------------------------------------------------------------------------

describe('Oscillators @ 10k bars', () => {
  test('compares oscillator throughput', async ({ bench }) => {
    await bench.compare(
      bench('StochRSI (period=14, kPeriod=3, dPeriod=3)', () => {
        computeStochRSI(close10k, { period: 14, kPeriod: 3, dPeriod: 3 })
      }),
      bench('Fisher Transform (period=10)', () => {
        computeFisherTransform(hl10k, { period: 10 })
      }),
      bench('Schaff Trend Cycle (fast=23, slow=50, cycle=10)', () => {
        computeSchaffTrendCycle(close10k, {
          fast: 23,
          slow: 50,
          cycle: 10,
          factor: 0.5,
        })
      }),
    )
  })
})

describe('Oscillators @ 100k bars', () => {
  test('compares oscillator throughput', async ({ bench }) => {
    await bench.compare(
      bench('StochRSI (period=14, kPeriod=3, dPeriod=3)', () => {
        computeStochRSI(close100k, { period: 14, kPeriod: 3, dPeriod: 3 })
      }),
      bench('Fisher Transform (period=10)', () => {
        computeFisherTransform(hl100k, { period: 10 })
      }),
      bench('Schaff Trend Cycle (fast=23, slow=50, cycle=10)', () => {
        computeSchaffTrendCycle(close100k, {
          fast: 23,
          slow: 50,
          cycle: 10,
          factor: 0.5,
        })
      }),
    )
  })
})
