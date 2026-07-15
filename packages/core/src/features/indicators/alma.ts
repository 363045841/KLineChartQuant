import { KLineChartError } from '../../errors'
/**
 * ALMA — Arnaud Legoux Moving Average.
 *
 * Public reference: Legoux & Beneduce, "ALMA Indicator Description" (2009).
 *
 * Weighted MA where weights are a Gaussian centred at `offset * (period-1)`
 * (default 0.85 = near the right edge), spread parameter `sigma` (default 6).
 *
 *   m       = offset * (period - 1)
 *   s       = period / sigma
 *   w[k]    = exp(-(k - m)^2 / (2 * s^2))   for k in 0..period-1
 *   alma[i] = sum(w[k] * price[i - k]) / sum(w[k])
 *
 * `offset` near 1 follows price tightly (short lag); near 0 smooths heavily.
 * `sigma` controls the bell width — lower = sharper centre.
 *
 * Output length === input length. Indices < period - 1 are NaN.
 */

export interface AlmaOptions {
  period: number
  /** Default 0.85 — fractional position of the Gaussian centre, in [0, 1]. */
  offset?: number
  /** Default 6 — bell width parameter. Must be > 0. */
  sigma?: number
}

export function computeALMA(prices: ReadonlyArray<number>, opts: AlmaOptions): Float64Array {
  const { period } = opts
  const offset = opts.offset ?? 0.85
  const sigma = opts.sigma ?? 6
  if (period < 1 || !Number.isFinite(period))
    throw new KLineChartError('INDICATOR_INVALID_PARAM', 'computeALMA: period must be >= 1')
  if (sigma <= 0 || !Number.isFinite(sigma))
    throw new KLineChartError('INDICATOR_INVALID_PARAM', 'computeALMA: sigma must be > 0')
  if (offset < 0 || offset > 1)
    throw new KLineChartError('INDICATOR_INVALID_PARAM', 'computeALMA: offset must be in [0, 1]')

  const out = new Float64Array(prices.length)
  const m = offset * (period - 1)
  const s = period / sigma
  const denom = 2 * s * s
  const weights = new Float64Array(period)
  let wsum = 0
  for (let k = 0; k < period; k++) {
    const w = Math.exp(-((k - m) * (k - m)) / denom)
    weights[k] = w
    wsum += w
  }

  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      out[i] = Number.NaN
      continue
    }
    let acc = 0
    for (let k = 0; k < period; k++) {
      acc += (weights[k] as number) * (prices[i - k] as number)
    }
    out[i] = acc / wsum
  }
  return out
}
