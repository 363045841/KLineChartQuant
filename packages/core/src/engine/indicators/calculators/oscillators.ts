/** CCI、KST、TRIX 等仍在 core 中的振荡指标计算。 */
import type { KLineData } from '@/foundation/types/price.js'

import { _computeEMASeries } from './_shared.js'

export function calcCCIData(data: KLineData[], period: number): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(data.length)

  if (data.length < period) return result

  const tpValues: number[] = []
  for (const item of data) {
    tpValues.push((item.high + item.low + item.close) / 3)
  }

  let sum = 0
  for (let i = 0; i < period; i++) {
    sum += tpValues[i]!
  }

  for (let i = period - 1; i < data.length; i++) {
    if (i >= period) {
      sum = sum - tpValues[i - period]! + tpValues[i]!
    }
    const sma = sum / period

    let meanDeviation = 0
    for (let j = 0; j < period; j++) {
      meanDeviation += Math.abs(tpValues[i - j]! - sma)
    }
    meanDeviation /= period

    if (meanDeviation === 0) {
      result[i] = 0
    } else {
      result[i] = (tpValues[i]! - sma) / (0.015 * meanDeviation)
    }
  }

  return result
}

export interface KSTPoint {
  kst: number
  signal: number
}

function calcROCInternal(data: KLineData[], period: number): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(data.length)

  if (data.length < period + 1) return result

  for (let i = period; i < data.length; i++) {
    const currentClose = data[i]?.close
    const prevClose = data[i - period]?.close

    if (currentClose !== undefined && prevClose !== undefined && prevClose !== 0) {
      result[i] = ((currentClose - prevClose) / prevClose) * 100
    }
  }

  return result
}

function calcSMAInternal(data: (number | undefined)[], period: number): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(data.length)

  let sum = 0
  let count = 0

  for (let i = 0; i < data.length; i++) {
    const val = data[i]

    if (val !== undefined) {
      sum += val
      count++

      if (count > period) {
        const oldVal = data[i - period]
        if (oldVal !== undefined) {
          sum -= oldVal
          count--
        }
      }

      if (count === period) {
        result[i] = sum / period
      }
    }
  }

  return result
}

export function calcKSTData(
  data: KLineData[],
  roc1: number,
  roc2: number,
  roc3: number,
  roc4: number,
  signalPeriod: number,
): KSTPoint[] {
  const result: KSTPoint[] = new Array(data.length)

  const roc1Data = calcROCInternal(data, roc1)
  const roc2Data = calcROCInternal(data, roc2)
  const roc3Data = calcROCInternal(data, roc3)
  const roc4Data = calcROCInternal(data, roc4)

  const sma1 = calcSMAInternal(roc1Data, 10)
  const sma2 = calcSMAInternal(roc2Data, 10)
  const sma3 = calcSMAInternal(roc3Data, 10)
  const sma4 = calcSMAInternal(roc4Data, 15)

  const kstValues: (number | undefined)[] = new Array(data.length)

  for (let i = 0; i < data.length; i++) {
    const v1 = sma1[i]
    const v2 = sma2[i]
    const v3 = sma3[i]
    const v4 = sma4[i]

    if (v1 !== undefined && v2 !== undefined && v3 !== undefined && v4 !== undefined) {
      kstValues[i] = v1 * 1 + v2 * 2 + v3 * 3 + v4 * 4
    }
  }

  const signalData = calcSMAInternal(kstValues, signalPeriod)

  for (let i = 0; i < data.length; i++) {
    const kst = kstValues[i]
    const signal = signalData[i]

    if (kst !== undefined && signal !== undefined) {
      result[i] = { kst, signal }
    }
  }

  return result
}

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
