import { KLineChartError } from '../../errors'
/**
 * STC — Schaff Trend Cycle (Doug Schaff, 2008).
 *
 * Doubly-stochastic MACD-cycle hybrid:
 *
 *   macd      = EMA(close, fast) - EMA(close, slow)
 *   k1        = stoch(macd, cycle)         (raw, 0..100)
 *   d1        = EMA(k1, factor)            (smoothing)
 *   k2        = stoch(d1, cycle)
 *   STC       = EMA(k2, factor)
 *
 * Defaults: fast=23, slow=50, cycle=10, factor=0.5 (smoothing constant,
 * applied as `d = factor*new + (1-factor)*d_prev`).
 *
 * Output: `Float64Array` length === input. NaN until index >= slow + 2*cycle.
 */

export interface SchaffTrendCycleOptions {
  fast?: number
  slow?: number
  cycle?: number
  factor?: number
}

export function computeSchaffTrendCycle(
  prices: ReadonlyArray<number>,
  opts: SchaffTrendCycleOptions = {},
): Float64Array {
  const fast = opts.fast ?? 23
  const slow = opts.slow ?? 50
  const cycle = opts.cycle ?? 10
  const factor = opts.factor ?? 0.5
  if (fast < 2 || slow <= fast)
    throw new KLineChartError('INDICATOR_INVALID_PARAM', 'STC: require 2 <= fast < slow')
  if (cycle < 2) throw new KLineChartError('INDICATOR_INVALID_PARAM', 'STC: cycle must be >= 2')
  if (!(factor > 0 && factor <= 1))
    throw new KLineChartError('INDICATOR_INVALID_PARAM', 'STC: factor must be in (0, 1]')

  const n = prices.length
  const macd = new Float64Array(n)
  const kFast = 2 / (fast + 1)
  const kSlow = 2 / (slow + 1)
  let emaF = Number.NaN
  let emaS = Number.NaN
  for (let i = 0; i < n; i++) {
    const p = prices[i] as number
    emaF = Number.isNaN(emaF) ? p : kFast * p + (1 - kFast) * emaF
    emaS = Number.isNaN(emaS) ? p : kSlow * p + (1 - kSlow) * emaS
    macd[i] = emaF - emaS
  }

  const k1 = stochOver(macd, cycle)
  const d1 = smoothFactor(k1, factor)
  const k2 = stochOver(d1, cycle)
  const stc = smoothFactor(k2, factor)
  return stc
}

function stochOver(input: Float64Array, period: number): Float64Array {
  const n = input.length
  const out = new Float64Array(n)
  out.fill(Number.NaN)
  for (let i = period - 1; i < n; i++) {
    let lo = Infinity
    let hi = -Infinity
    let any = false
    for (let j = i - period + 1; j <= i; j++) {
      const v = input[j] as number
      if (Number.isNaN(v)) continue
      any = true
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    if (!any) continue
    const denom = hi - lo
    out[i] = denom === 0 ? 50 : (100 * ((input[i] as number) - lo)) / denom
  }
  return out
}

function smoothFactor(input: Float64Array, factor: number): Float64Array {
  const n = input.length
  const out = new Float64Array(n)
  out.fill(Number.NaN)
  let prev = Number.NaN
  for (let i = 0; i < n; i++) {
    const v = input[i] as number
    if (Number.isNaN(v)) continue
    prev = Number.isNaN(prev) ? v : factor * v + (1 - factor) * prev
    out[i] = prev
  }
  return out
}
