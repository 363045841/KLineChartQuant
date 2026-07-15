import { KLineChartError } from '../../errors'
/**
 * Ultimate Oscillator — Larry Williams (1976).
 *
 * Weighted multi-period buying-pressure / true-range oscillator.
 *
 *   prevClose[i] = close[i-1]
 *   BP[i]        = close[i] - min(low[i], prevClose[i])
 *   TR[i]        = max(high[i], prevClose[i]) - min(low[i], prevClose[i])
 *   avg(N)       = sum(BP, N) / sum(TR, N)
 *   UO[i]        = 100 * (4*avg(p1) + 2*avg(p2) + avg(p3)) / 7
 *
 * Defaults: p1=7, p2=14, p3=28.
 *
 * Output: `Float64Array` length === input. NaN until index >= max(p1,p2,p3).
 */

export interface UltimateOscillatorOptions {
  p1?: number
  p2?: number
  p3?: number
}

export function computeUltimateOscillator(
  bars: ReadonlyArray<{ high: number; low: number; close: number }>,
  opts: UltimateOscillatorOptions = {},
): Float64Array {
  const p1 = opts.p1 ?? 7
  const p2 = opts.p2 ?? 14
  const p3 = opts.p3 ?? 28
  if (p1 < 1 || p2 < 1 || p3 < 1) {
    throw new KLineChartError(
      'INDICATOR_INVALID_PARAM',
      'computeUltimateOscillator: all periods must be >= 1',
    )
  }
  const n = bars.length
  const bp = new Float64Array(n)
  const tr = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const b = bars[i] as { high: number; low: number; close: number }
    if (i === 0) {
      bp[i] = 0
      tr[i] = b.high - b.low
      continue
    }
    const pc = (bars[i - 1] as { close: number }).close
    const minLow = Math.min(b.low, pc)
    bp[i] = b.close - minLow
    tr[i] = Math.max(b.high, pc) - minLow
  }
  const r1 = rollingRatio(bp, tr, p1)
  const r2 = rollingRatio(bp, tr, p2)
  const r3 = rollingRatio(bp, tr, p3)
  const out = new Float64Array(n)
  const maxP = Math.max(p1, p2, p3)
  for (let i = 0; i < n; i++) {
    if (i < maxP) {
      out[i] = Number.NaN
      continue
    }
    out[i] = (100 * (4 * (r1[i] as number) + 2 * (r2[i] as number) + (r3[i] as number))) / 7
  }
  return out
}

function rollingRatio(num: Float64Array, den: Float64Array, period: number): Float64Array {
  const n = num.length
  const out = new Float64Array(n)
  let sNum = 0
  let sDen = 0
  for (let i = 0; i < n; i++) {
    sNum += num[i] as number
    sDen += den[i] as number
    if (i >= period) {
      sNum -= num[i - period] as number
      sDen -= den[i - period] as number
    }
    if (i < period - 1 || sDen === 0) {
      out[i] = Number.NaN
    } else {
      out[i] = sNum / sDen
    }
  }
  return out
}
