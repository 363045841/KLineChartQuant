import { KLineChartError } from '../../errors'
/**
 * Awesome Oscillator — Bill Williams.
 *
 *   median[i] = (high[i] + low[i]) / 2
 *   AO[i]     = SMA(median, fast) - SMA(median, slow)
 *
 * Defaults: fast=5, slow=34.
 *
 * Output: `Float64Array` of length === input. NaN leading.
 */

export interface AwesomeOscillatorOptions {
  fast?: number
  slow?: number
}

export function computeAwesomeOscillator(
  bars: ReadonlyArray<{ high: number; low: number }>,
  opts: AwesomeOscillatorOptions = {},
): Float64Array {
  const fast = opts.fast ?? 5
  const slow = opts.slow ?? 34
  if (fast < 1 || slow < 1 || fast >= slow) {
    throw new KLineChartError(
      'INDICATOR_INVALID_PARAM',
      'computeAwesomeOscillator: require 1 <= fast < slow',
    )
  }
  const n = bars.length
  const med = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const b = bars[i] as { high: number; low: number }
    med[i] = (b.high + b.low) / 2
  }
  const sf = simpleSMA(med, fast)
  const ss = simpleSMA(med, slow)
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const a = sf[i] as number
    const b = ss[i] as number
    out[i] = Number.isNaN(a) || Number.isNaN(b) ? Number.NaN : a - b
  }
  return out
}

function simpleSMA(input: Float64Array, period: number): Float64Array {
  const n = input.length
  const out = new Float64Array(n)
  let acc = 0
  for (let i = 0; i < n; i++) {
    acc += input[i] as number
    if (i >= period) acc -= input[i - period] as number
    out[i] = i < period - 1 ? Number.NaN : acc / period
  }
  return out
}
