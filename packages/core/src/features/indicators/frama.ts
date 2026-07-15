import { KLineChartError } from '../../errors'
/**
 * FRAMA — Fractal Adaptive Moving Average (John Ehlers, 2005).
 *
 * Estimates the fractal dimension D of price over the last `period` bars
 * (split into two halves) and uses it to adapt an EMA smoothing constant:
 *
 *   N1 = (max(H_first_half) - min(H_first_half)) / (period/2)
 *   N2 = (max(H_second_half) - min(H_second_half)) / (period/2)
 *   N3 = (max(H_full) - min(H_full)) / period
 *   D  = (log(N1 + N2) - log(N3)) / log(2)
 *   alpha = exp(-4.6 * (D - 1))
 *   FRAMA = alpha * price + (1 - alpha) * FRAMA_prev
 *
 * Output length === input length. Indices < period are NaN.
 *
 * Note: Ehlers's original uses H (high) and L (low) separately for each
 * range. With close-only input we use price extrema as a faithful
 * close-input approximation — documented divergence vs the H/L variant.
 */

export interface FramaOptions {
  /** Must be EVEN and >= 4. Default 16. */
  period: number
}

function rangeMaxMin(
  arr: ReadonlyArray<number>,
  start: number,
  end: number,
): {
  max: number
  min: number
} {
  let max = -Infinity
  let min = Infinity
  for (let i = start; i < end; i++) {
    const v = arr[i] as number
    if (v > max) max = v
    if (v < min) min = v
  }
  return { max, min }
}

export function computeFRAMA(prices: ReadonlyArray<number>, opts: FramaOptions): Float64Array {
  const { period } = opts
  if (period < 4 || period % 2 !== 0 || !Number.isFinite(period)) {
    throw new KLineChartError(
      'INDICATOR_INVALID_PARAM',
      'computeFRAMA: period must be even and >= 4',
    )
  }

  const n = prices.length
  const out = new Float64Array(n)
  const half = period >> 1
  let prev = Number.NaN

  for (let i = 0; i < n; i++) {
    if (i < period - 1) {
      out[i] = Number.NaN
      continue
    }
    const fullStart = i - period + 1
    const midStart = i - half + 1
    const r1 = rangeMaxMin(prices, fullStart, fullStart + half)
    const r2 = rangeMaxMin(prices, midStart, midStart + half)
    const rF = rangeMaxMin(prices, fullStart, fullStart + period)
    const N1 = (r1.max - r1.min) / half
    const N2 = (r2.max - r2.min) / half
    const N3 = (rF.max - rF.min) / period

    let alpha: number
    if (N1 <= 0 || N2 <= 0 || N3 <= 0) {
      // Degenerate flat window — fall back to a simple EMA constant.
      alpha = 2 / (period + 1)
    } else {
      const D = (Math.log(N1 + N2) - Math.log(N3)) / Math.LN2
      alpha = Math.exp(-4.6 * (D - 1))
      // Numerical safety: clamp to [0.01, 1].
      if (!(alpha > 0)) alpha = 0.01
      if (alpha > 1) alpha = 1
    }

    const cur = prices[i] as number
    if (Number.isNaN(prev)) {
      prev = cur
    } else {
      prev = alpha * cur + (1 - alpha) * prev
    }
    out[i] = prev
  }
  return out
}
