import { KLineChartError } from '../../errors'
/**
 * T3 — Tim Tillson's smoothed-EMA cascade (1998).
 *
 * Public reference: T. Tillson, "Better Moving Averages",
 * Technical Analysis of Stocks & Commodities, January 1998.
 *
 * Algorithm:
 *   1. EMA1 = EMA(price, period)
 *   2. EMA2 = EMA(EMA1,  period)
 *   3. EMA3 = EMA(EMA2,  period)
 *   4. EMA4 = EMA(EMA3,  period)
 *   5. EMA5 = EMA(EMA4,  period)
 *   6. EMA6 = EMA(EMA5,  period)
 *   T3 = c1*EMA6 + c2*EMA5 + c3*EMA4 + c4*EMA3
 *   where
 *     a  = volume factor in [0, 1], default 0.7
 *     c1 = -a^3
 *     c2 =  3*a^2 + 3*a^3
 *     c3 = -6*a^2 - 3*a - 3*a^3
 *     c4 =  1 + 3*a + a^3 + 3*a^2
 *
 * Output length === input length. The first non-NaN value emerges once the
 * EMA cascade has primed (we seed each EMA on its first input).
 */

export interface T3Options {
  period: number
  /** Volume factor in [0, 1]. Default 0.7. Lower = smoother. */
  volumeFactor?: number
}

function emaSeries(input: Float64Array, period: number): Float64Array {
  const out = new Float64Array(input.length)
  const k = 2 / (period + 1)
  let prev = Number.NaN
  for (let i = 0; i < input.length; i++) {
    const v = input[i] as number
    if (Number.isNaN(v)) {
      out[i] = Number.NaN
      continue
    }
    if (Number.isNaN(prev)) {
      prev = v
    } else {
      prev = k * v + (1 - k) * prev
    }
    out[i] = prev
  }
  return out
}

export function computeT3(prices: ReadonlyArray<number>, opts: T3Options): Float64Array {
  const { period } = opts
  const a = opts.volumeFactor ?? 0.7
  if (period < 2 || !Number.isFinite(period))
    throw new KLineChartError('INDICATOR_INVALID_PARAM', 'computeT3: period must be >= 2')
  if (a < 0 || a > 1 || !Number.isFinite(a)) {
    throw new KLineChartError(
      'INDICATOR_INVALID_PARAM',
      'computeT3: volumeFactor must be in [0, 1]',
    )
  }

  const src = new Float64Array(prices.length)
  for (let i = 0; i < prices.length; i++) src[i] = prices[i] as number

  const e1 = emaSeries(src, period)
  const e2 = emaSeries(e1, period)
  const e3 = emaSeries(e2, period)
  const e4 = emaSeries(e3, period)
  const e5 = emaSeries(e4, period)
  const e6 = emaSeries(e5, period)

  const a2 = a * a
  const a3 = a2 * a
  const c1 = -a3
  const c2 = 3 * a2 + 3 * a3
  const c3 = -6 * a2 - 3 * a - 3 * a3
  const c4 = 1 + 3 * a + a3 + 3 * a2

  const out = new Float64Array(prices.length)
  for (let i = 0; i < prices.length; i++) {
    const v6 = e6[i] as number
    const v5 = e5[i] as number
    const v4 = e4[i] as number
    const v3 = e3[i] as number
    if (Number.isNaN(v6) || Number.isNaN(v5) || Number.isNaN(v4) || Number.isNaN(v3)) {
      out[i] = Number.NaN
    } else {
      out[i] = c1 * v6 + c2 * v5 + c3 * v4 + c4 * v3
    }
  }
  return out
}
