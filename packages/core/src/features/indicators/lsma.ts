import { KLineChartError } from '../../errors'
/**
 * LSMA — Least-Squares (Linear Regression) Moving Average.
 *
 * At each index i (with at least `period` samples available), fit a
 * line `y = a + b * x` over the last `period` prices via least squares,
 * and emit the value of that line at the right endpoint (`y[period-1]`).
 *
 * Closed-form (mean-centred):
 *   x̄ = (period - 1) / 2          (since x = 0..period-1)
 *   ȳ = mean(prices over window)
 *   b = sum((x - x̄) * (y - ȳ)) / sum((x - x̄)^2)
 *   a = ȳ - b * x̄
 *   lsma[i] = a + b * (period - 1)
 *
 * Output length === input length. Indices < period - 1 are NaN.
 */

export interface LsmaOptions {
  period: number
}

export function computeLSMA(prices: ReadonlyArray<number>, opts: LsmaOptions): Float64Array {
  const { period } = opts
  if (period < 2 || !Number.isFinite(period))
    throw new KLineChartError('INDICATOR_INVALID_PARAM', 'computeLSMA: period must be >= 2')

  const out = new Float64Array(prices.length)
  const xbar = (period - 1) / 2
  // sum((x - x̄)^2) for x = 0..period-1 is a constant; precompute.
  let xxSum = 0
  for (let k = 0; k < period; k++) {
    const d = k - xbar
    xxSum += d * d
  }

  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      out[i] = Number.NaN
      continue
    }
    // Window covers indices i - period + 1 .. i, mapped to x = 0..period-1.
    let ysum = 0
    for (let k = 0; k < period; k++) {
      ysum += prices[i - period + 1 + k] as number
    }
    const ybar = ysum / period
    let xy = 0
    for (let k = 0; k < period; k++) {
      const xd = k - xbar
      const yd = (prices[i - period + 1 + k] as number) - ybar
      xy += xd * yd
    }
    const b = xy / xxSum
    const a = ybar - b * xbar
    out[i] = a + b * (period - 1)
  }
  return out
}
