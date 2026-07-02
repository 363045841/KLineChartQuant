import type { KLineData } from '../../../types/price'

import { _computeEMASeries } from './_shared'

export function calcATRData(data: KLineData[], period: number): (number | undefined)[] {
  const n = data.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)
  if (n === 0 || period <= 0) return result

  if (period === 1) {
    const first = data[0]!
    result[0] = first.high - first.low
    let prevClose = first.close
    for (let i = 1; i < n; i++) {
      const cur = data[i]!
      const tr = Math.max(
        cur.high - cur.low,
        Math.abs(cur.high - prevClose),
        Math.abs(cur.low - prevClose),
      )
      result[i] = tr
      prevClose = cur.close
    }
    return result
  }

  if (n < period) return result

  const first = data[0]!
  let sumTR = first.high - first.low
  let prevClose = first.close

  for (let i = 1; i < period; i++) {
    const cur = data[i]!
    sumTR += Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prevClose),
      Math.abs(cur.low - prevClose),
    )
    prevClose = cur.close
  }

  let atr = sumTR / period
  result[period - 1] = atr

  const periodMinusOne = period - 1
  for (let i = period; i < n; i++) {
    const cur = data[i]!
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prevClose),
      Math.abs(cur.low - prevClose),
    )
    atr = (periodMinusOne * atr + tr) / period
    result[i] = atr
    prevClose = cur.close
  }

  return result
}

export function calcHVData(
  data: KLineData[],
  period: number,
  annualizationFactor: number,
): (number | undefined)[] {
  const n = data.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)
  if (n < 2 || period <= 0 || annualizationFactor <= 0) return result

  const logReturns: number[] = new Array(n)
  logReturns[0] = 0
  for (let t = 1; t < n; t++) {
    const prev = data[t - 1]!.close
    const cur = data[t]!.close
    logReturns[t] = prev > 0 && cur > 0 ? Math.log(cur / prev) : 0
  }

  const annScale = Math.sqrt(annualizationFactor)
  for (let t = period; t < n; t++) {
    let sum = 0
    for (let k = 1; k <= period; k++) sum += logReturns[t - period + k]!
    const mean = sum / period
    let varSum = 0
    for (let k = 1; k <= period; k++) {
      const diff = logReturns[t - period + k]! - mean
      varSum += diff * diff
    }
    const std = Math.sqrt(varSum / (period - 1 > 0 ? period - 1 : 1))
    result[t] = std * annScale * 100
  }

  return result
}

export function calcParkinsonData(
  data: KLineData[],
  period: number,
  annualizationFactor: number,
): (number | undefined)[] {
  const n = data.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)
  if (n === 0 || period <= 0 || annualizationFactor <= 0 || n < period) return result

  const factor = 1 / (4 * Math.log(2))
  const annScale = Math.sqrt(annualizationFactor)

  const hlLogSq: number[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const bar = data[i]!
    if (bar.high > 0 && bar.low > 0) {
      const ln = Math.log(bar.high / bar.low)
      hlLogSq[i] = ln * ln
    } else {
      hlLogSq[i] = 0
    }
  }

  for (let t = period - 1; t < n; t++) {
    let sum = 0
    for (let k = 0; k < period; k++) sum += hlLogSq[t - k]!
    const mean = sum / period
    result[t] = Math.sqrt(factor * mean) * annScale * 100
  }

  return result
}

export function calcChaikinVolData(
  data: KLineData[],
  emaPeriod: number,
  rocPeriod: number,
): (number | undefined)[] {
  const n = data.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)
  if (n === 0 || emaPeriod <= 0 || rocPeriod <= 0) return result

  const hl: (number | undefined)[] = new Array(n)
  for (let i = 0; i < n; i++) hl[i] = data[i]!.high - data[i]!.low

  const emaSeries = _computeEMASeries(hl, emaPeriod)

  for (let t = rocPeriod; t < n; t++) {
    const cur = emaSeries[t]
    const prev = emaSeries[t - rocPeriod]
    if (cur === undefined || prev === undefined || prev === 0) continue
    result[t] = ((cur - prev) / prev) * 100
  }

  return result
}
