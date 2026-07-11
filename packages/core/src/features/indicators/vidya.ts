import { KLineChartError } from '../../errors'
/**
 * VIDYA — Variable Index Dynamic Average (Tushar Chande).
 *
 * CMO-adapted EMA: the smoothing constant is scaled by the absolute value
 * of the Chande Momentum Oscillator, so VIDYA accelerates in trending
 * markets and slows in chop.
 *
 *   gain[i] = max(price[i] - price[i-1], 0)
 *   loss[i] = max(price[i-1] - price[i], 0)
 *   CMO(t)  = 100 * (sum(gain, t-cmoPeriod+1..t) - sum(loss, ...))
 *                  / (sum(gain) + sum(loss))           (NaN-guarded)
 *   alpha   = (2 / (period + 1)) * |CMO(t) / 100|
 *   VIDYA[i] = alpha * price[i] + (1 - alpha) * VIDYA[i-1]
 *
 * Output length === input length. Indices < cmoPeriod are NaN. VIDYA seeds
 * on the first valid CMO sample.
 */

export interface VidyaOptions {
  period: number
  /** Window for the CMO numerator/denominator. Default 9. */
  cmoPeriod?: number
}

export function computeVIDYA(prices: ReadonlyArray<number>, opts: VidyaOptions): Float64Array {
  const { period } = opts
  const cmoPeriod = opts.cmoPeriod ?? 9
  if (period < 2 || !Number.isFinite(period))
    throw new KLineChartError('INDICATOR_INVALID_PARAM', 'computeVIDYA: period must be >= 2')
  if (cmoPeriod < 1 || !Number.isFinite(cmoPeriod)) {
    throw new KLineChartError('INDICATOR_INVALID_PARAM', 'computeVIDYA: cmoPeriod must be >= 1')
  }

  const n = prices.length
  const out = new Float64Array(n)
  const baseAlpha = 2 / (period + 1)

  // Rolling sums of gain / loss across the cmoPeriod window of diffs.
  let gainSum = 0
  let lossSum = 0
  let prev = Number.NaN

  for (let i = 0; i < n; i++) {
    if (i === 0) {
      out[i] = Number.NaN
      continue
    }
    const cur = prices[i] as number
    const previous = prices[i - 1] as number
    const diff = cur - previous
    const gain = diff > 0 ? diff : 0
    const loss = diff < 0 ? -diff : 0
    gainSum += gain
    lossSum += loss

    // Drop the diff that just slid out of the window.
    if (i > cmoPeriod) {
      const drop = (prices[i - cmoPeriod] as number) - (prices[i - cmoPeriod - 1] as number)
      if (drop > 0) gainSum -= drop
      else if (drop < 0) lossSum += drop // (-drop is the abs)
    }

    if (i < cmoPeriod) {
      out[i] = Number.NaN
      continue
    }

    const denom = gainSum + lossSum
    const cmoAbs = denom === 0 ? 0 : Math.abs((gainSum - lossSum) / denom)
    const alpha = baseAlpha * cmoAbs

    if (Number.isNaN(prev)) {
      prev = cur
    } else {
      prev = alpha * cur + (1 - alpha) * prev
    }
    out[i] = prev
  }
  return out
}
