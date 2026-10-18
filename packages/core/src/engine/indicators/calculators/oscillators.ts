/** 仍在 core 中的振荡指标计算（TRIX）。 */
import type { KLineData } from '@/foundation/types/price.js'

import { _computeEMASeries } from './_shared.js'

export interface TRIXResult {
  series: (number | undefined)[]
  signalSeries: (number | undefined)[]
}

export function calcTRIXData(data: KLineData[], period: number, signalPeriod: number): TRIXResult {
  const n = data.length
  const series: (number | undefined)[] = new Array(n).fill(undefined)
  const signalSeries: (number | undefined)[] = new Array(n).fill(undefined)
  if (n === 0 || period <= 0) return { series, signalSeries }

  const closes = new Array<number | undefined>(n)
  for (let i = 0; i < n; i++) closes[i] = data[i]!.close

  const ema1 = _computeEMASeries(closes, period)
  const ema2 = _computeEMASeries(ema1, period)
  const ema3 = _computeEMASeries(ema2, period)

  for (let t = 1; t < n; t++) {
    const cur = ema3[t]
    const prev = ema3[t - 1]
    if (cur === undefined || prev === undefined || prev === 0) continue
    series[t] = ((cur - prev) / prev) * 100
  }

  if (signalPeriod > 0) {
    const smoothed = _computeEMASeries(series, signalPeriod)
    for (let i = 0; i < n; i++) signalSeries[i] = smoothed[i]
  }

  return { series, signalSeries }
}
