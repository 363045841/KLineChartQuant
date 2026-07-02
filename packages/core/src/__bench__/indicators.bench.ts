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

import { bench, describe } from 'vitest'

// MA family (b-9)
import { computeALMA } from '../indicators/alma'

// Oscillator family (b-10)
import { computeAwesomeOscillator } from '../indicators/awesomeOscillator'
import { computeDPO } from '../indicators/dpo'
import { computeFisherTransform } from '../indicators/fisherTransform'
import { computeFRAMA } from '../indicators/frama'
import { computeLSMA } from '../indicators/lsma'
import { computeSchaffTrendCycle } from '../indicators/schaffTrendCycle'
import { computeStochRSI } from '../indicators/stochRSI'
import { computeT3 } from '../indicators/t3'
import { computeUltimateOscillator } from '../indicators/ultimateOscillator'
import { computeVIDYA } from '../indicators/vidya'
import { computeZLEMA } from '../indicators/zlema'

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

function buildOhlcWithOpen(n: number): Array<{
  open: number
  high: number
  low: number
  close: number
}> {
  const closes = buildCloseArray(n)
  const out: Array<{ open: number; high: number; low: number; close: number }> = new Array(n)
  for (let i = 0; i < n; i++) {
    const c = closes[i]!
    // Open = previous close (or self at i=0). Gives a non-degenerate body.
    const o = i === 0 ? c : closes[i - 1]!
    out[i] = { open: o, high: Math.max(o, c) + 0.5, low: Math.min(o, c) - 0.5, close: c }
  }
  return out
}

const close10k = buildCloseArray(10_000)
const close100k = buildCloseArray(100_000)
const hl10k = buildOhlcBars(10_000)
const hl100k = buildOhlcBars(100_000)
const ohlc10k = buildOhlcWithOpen(10_000)
const ohlc100k = buildOhlcWithOpen(100_000)

// ---------------------------------------------------------------------------
// MA family — close-only inputs
// ---------------------------------------------------------------------------

describe('MA family @ 10k bars (close-only)', () => {
  bench('ALMA (period=21)', () => {
    computeALMA(close10k, { period: 21 })
  })

  bench('T3 (period=21, volumeFactor=0.7)', () => {
    computeT3(close10k, { period: 21, volumeFactor: 0.7 })
  })

  bench('ZLEMA (period=21)', () => {
    computeZLEMA(close10k, { period: 21 })
  })

  bench('LSMA (period=21)', () => {
    computeLSMA(close10k, { period: 21 })
  })

  bench('VIDYA (period=21, cmoPeriod=9)', () => {
    computeVIDYA(close10k, { period: 21, cmoPeriod: 9 })
  })

  bench('FRAMA (period=16)', () => {
    // FRAMA requires `period` even and >= 4
    computeFRAMA(close10k, { period: 16 })
  })
})

describe('MA family @ 100k bars (close-only)', () => {
  bench('ALMA (period=21)', () => {
    computeALMA(close100k, { period: 21 })
  })

  bench('T3 (period=21, volumeFactor=0.7)', () => {
    computeT3(close100k, { period: 21, volumeFactor: 0.7 })
  })

  bench('ZLEMA (period=21)', () => {
    computeZLEMA(close100k, { period: 21 })
  })

  bench('LSMA (period=21)', () => {
    computeLSMA(close100k, { period: 21 })
  })

  bench('VIDYA (period=21, cmoPeriod=9)', () => {
    computeVIDYA(close100k, { period: 21, cmoPeriod: 9 })
  })

  bench('FRAMA (period=16)', () => {
    computeFRAMA(close100k, { period: 16 })
  })
})

// ---------------------------------------------------------------------------
// Oscillators — mixed input signatures
// ---------------------------------------------------------------------------

describe('Oscillators @ 10k bars', () => {
  bench('StochRSI (period=14, kPeriod=3, dPeriod=3)', () => {
    computeStochRSI(close10k, { period: 14, kPeriod: 3, dPeriod: 3 })
  })

  bench('Awesome Oscillator (fast=5, slow=34)', () => {
    computeAwesomeOscillator(hl10k, { fast: 5, slow: 34 })
  })

  bench('Ultimate Oscillator (p1=7, p2=14, p3=28)', () => {
    computeUltimateOscillator(ohlc10k, { p1: 7, p2: 14, p3: 28 })
  })

  bench('DPO (period=20)', () => {
    computeDPO(close10k, { period: 20 })
  })

  bench('Fisher Transform (period=10)', () => {
    computeFisherTransform(hl10k, { period: 10 })
  })

  bench('Schaff Trend Cycle (fast=23, slow=50, cycle=10)', () => {
    computeSchaffTrendCycle(close10k, {
      fast: 23,
      slow: 50,
      cycle: 10,
      factor: 0.5,
    })
  })
})

describe('Oscillators @ 100k bars', () => {
  bench('StochRSI (period=14, kPeriod=3, dPeriod=3)', () => {
    computeStochRSI(close100k, { period: 14, kPeriod: 3, dPeriod: 3 })
  })

  bench('Awesome Oscillator (fast=5, slow=34)', () => {
    computeAwesomeOscillator(hl100k, { fast: 5, slow: 34 })
  })

  bench('Ultimate Oscillator (p1=7, p2=14, p3=28)', () => {
    computeUltimateOscillator(ohlc100k, { p1: 7, p2: 14, p3: 28 })
  })

  bench('DPO (period=20)', () => {
    computeDPO(close100k, { period: 20 })
  })

  bench('Fisher Transform (period=10)', () => {
    computeFisherTransform(hl100k, { period: 10 })
  })

  bench('Schaff Trend Cycle (fast=23, slow=50, cycle=10)', () => {
    computeSchaffTrendCycle(close100k, {
      fast: 23,
      slow: 50,
      cycle: 10,
      factor: 0.5,
    })
  })
})
