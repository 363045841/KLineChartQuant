import { KLineChartError } from '../../errors'
/**
 * Fisher Transform — John Ehlers (2002).
 *
 * Maps price into a near-Gaussian distribution to make turning points sharper:
 *
 *   med[i]   = (high[i] + low[i]) / 2
 *   hi[i]    = max(med, period)
 *   lo[i]    = min(med, period)
 *   raw[i]   = 0.5 * 2 * ((med - lo) / (hi - lo) - 0.5)            (in [-1, 1))
 *   v[i]     = clip(0.33 * raw + 0.67 * v[i-1], -0.999, 0.999)
 *   fish[i]  = 0.5 * ln((1 + v) / (1 - v)) + 0.5 * fish[i-1]
 *
 * Output: `{ fisher, trigger }` parallel arrays. `trigger` is `fisher`
 * shifted one bar (a common companion plot).
 */

export interface FisherTransformOptions {
  period: number
}

export function computeFisherTransform(
  bars: ReadonlyArray<{ high: number; low: number }>,
  opts: FisherTransformOptions,
): { fisher: Float64Array; trigger: Float64Array } {
  const { period } = opts
  if (period < 2 || !Number.isFinite(period)) {
    throw new KLineChartError(
      'INDICATOR_INVALID_PARAM',
      'computeFisherTransform: period must be >= 2',
    )
  }
  const n = bars.length
  const fisher = new Float64Array(n)
  const trigger = new Float64Array(n)
  fisher.fill(Number.NaN)
  trigger.fill(Number.NaN)

  let v = 0
  let f = 0

  for (let i = 0; i < n; i++) {
    if (i < period - 1) continue
    let hi = -Infinity
    let lo = Infinity
    for (let j = i - period + 1; j <= i; j++) {
      const b = bars[j] as { high: number; low: number }
      const med = (b.high + b.low) / 2
      if (med > hi) hi = med
      if (med < lo) lo = med
    }
    const b = bars[i] as { high: number; low: number }
    const medCur = (b.high + b.low) / 2
    const denom = hi - lo
    const norm = denom === 0 ? 0 : (medCur - lo) / denom // [0, 1]
    const raw = 2 * (norm - 0.5) // [-1, 1]
    v = 0.33 * raw + 0.67 * v
    if (v > 0.999) v = 0.999
    if (v < -0.999) v = -0.999
    const fNew = 0.5 * Math.log((1 + v) / (1 - v)) + 0.5 * f
    trigger[i] = f // previous fisher serves as trigger
    f = fNew
    fisher[i] = f
  }
  return { fisher, trigger }
}
