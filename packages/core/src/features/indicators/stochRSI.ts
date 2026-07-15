import { KLineChartError } from '../../errors'
/**
 * Stochastic RSI (Chande & Kroll, 1994).
 *
 * Two-step composition:
 *   1. RSI(period) over close-only.
 *   2. Stochastic over the RSI series:
 *        k[i] = 100 * (RSI[i] - min(RSI, stochPeriod))
 *                   / (max(RSI, stochPeriod) - min(RSI, stochPeriod))
 *   3. Smooth k by SMA(smoothK) → %K; smooth %K by SMA(smoothD) → %D.
 *
 * Output: parallel `Float64Array` pair { k, d }, both length === input.
 * NaN leading. Returns 0..100.
 */

export interface StochRsiOptions {
  rsiPeriod: number
  stochPeriod: number
  smoothK?: number
  smoothD?: number
}

export function computeStochRSI(
  prices: ReadonlyArray<number>,
  opts: StochRsiOptions,
): { k: Float64Array; d: Float64Array } {
  const { rsiPeriod, stochPeriod } = opts
  const smoothK = opts.smoothK ?? 3
  const smoothD = opts.smoothD ?? 3
  if (rsiPeriod < 2 || stochPeriod < 2 || smoothK < 1 || smoothD < 1) {
    throw new KLineChartError('INDICATOR_INVALID_PARAM', 'computeStochRSI: invalid period args')
  }

  const n = prices.length
  const rsi = computeRsiSeries(prices, rsiPeriod)

  const rawK = new Float64Array(n)
  rawK.fill(Number.NaN)
  for (let i = rsiPeriod + stochPeriod - 1; i < n; i++) {
    let lo = Infinity
    let hi = -Infinity
    for (let j = i - stochPeriod + 1; j <= i; j++) {
      const v = rsi[j] as number
      if (Number.isNaN(v)) continue
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    const denom = hi - lo
    rawK[i] = denom === 0 ? 50 : (100 * ((rsi[i] as number) - lo)) / denom
  }

  const k = smaSeries(rawK, smoothK)
  const d = smaSeries(k, smoothD)
  return { k, d }
}

function computeRsiSeries(prices: ReadonlyArray<number>, period: number): Float64Array {
  const n = prices.length
  const out = new Float64Array(n)
  out.fill(Number.NaN)
  if (n < period + 1) return out

  let gainSum = 0
  let lossSum = 0
  for (let i = 1; i <= period; i++) {
    const diff = (prices[i] as number) - (prices[i - 1] as number)
    if (diff > 0) gainSum += diff
    else lossSum += -diff
  }
  let avgGain = gainSum / period
  let avgLoss = lossSum / period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)

  for (let i = period + 1; i < n; i++) {
    const diff = (prices[i] as number) - (prices[i - 1] as number)
    const g = diff > 0 ? diff : 0
    const l = diff < 0 ? -diff : 0
    avgGain = (avgGain * (period - 1) + g) / period
    avgLoss = (avgLoss * (period - 1) + l) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

function smaSeries(input: Float64Array, period: number): Float64Array {
  const n = input.length
  const out = new Float64Array(n)
  out.fill(Number.NaN)
  let acc = 0
  let count = 0
  let start = 0
  for (let i = 0; i < n; i++) {
    const v = input[i] as number
    if (!Number.isNaN(v)) {
      acc += v
      count++
    }
    if (count >= period) {
      out[i] = acc / period
      // Slide window: subtract the value leaving the window (period back).
      const left = input[start + count - period] as number
      if (!Number.isNaN(left)) acc -= left
      else count-- // adjust if a NaN was at the left edge
      start = i - period + 2
    }
  }
  return out
}
