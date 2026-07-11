import { KLineChartError } from '../../errors'
/**
 * ZLEMA — Zero-Lag Exponential Moving Average (Ehlers).
 *
 * Removes EMA lag by feeding the EMA a "momentum-adjusted" series:
 *   lag = floor((period - 1) / 2)
 *   adj[i] = price[i] + (price[i] - price[i - lag])
 *   zlema  = EMA(adj, period)
 *
 * Output length === input length. Indices < lag are NaN (no adjustment
 * available); the EMA seeds on the first valid sample.
 */

export interface ZlemaOptions {
  period: number
}

export function computeZLEMA(prices: ReadonlyArray<number>, opts: ZlemaOptions): Float64Array {
  const { period } = opts
  if (period < 2 || !Number.isFinite(period))
    throw new KLineChartError('INDICATOR_INVALID_PARAM', 'computeZLEMA: period must be >= 2')

  const out = new Float64Array(prices.length)
  const lag = Math.floor((period - 1) / 2)
  const k = 2 / (period + 1)

  let ema = Number.NaN
  for (let i = 0; i < prices.length; i++) {
    if (i < lag) {
      out[i] = Number.NaN
      continue
    }
    const adj = 2 * (prices[i] as number) - (prices[i - lag] as number)
    if (Number.isNaN(ema)) {
      ema = adj
    } else {
      ema = k * adj + (1 - k) * ema
    }
    out[i] = ema
  }
  return out
}
