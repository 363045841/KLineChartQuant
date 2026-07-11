import { KLineChartError } from '../../errors'
/**
 * DPO — Detrended Price Oscillator.
 *
 *   shift = floor(period / 2) + 1
 *   sma   = SMA(close, period)
 *   DPO[i] = close[i - shift] - sma[i]
 *
 * The shift makes DPO a centred oscillator: the trend (SMA) is removed
 * at a centred lag so the result is a cleaner cycle indicator.
 *
 * Output: `Float64Array` length === input. NaN until index >= period + shift.
 */

export interface DpoOptions {
  period: number
}

export function computeDPO(prices: ReadonlyArray<number>, opts: DpoOptions): Float64Array {
  const { period } = opts
  if (period < 2 || !Number.isFinite(period))
    throw new KLineChartError('INDICATOR_INVALID_PARAM', 'computeDPO: period must be >= 2')
  const n = prices.length
  const out = new Float64Array(n)
  out.fill(Number.NaN)
  const shift = Math.floor(period / 2) + 1

  let acc = 0
  for (let i = 0; i < n; i++) {
    acc += prices[i] as number
    if (i >= period) acc -= prices[i - period] as number
    if (i < period - 1) continue
    const sma = acc / period
    const back = i - shift
    if (back >= 0) out[i] = (prices[back] as number) - sma
  }
  return out
}
