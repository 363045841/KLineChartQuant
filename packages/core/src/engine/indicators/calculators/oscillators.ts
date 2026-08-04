import type { KLineData } from '../../../foundation/types/price'

import { _computeEMASeries } from './_shared'

export function calcRSIData(data: KLineData[], period: number): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(data.length)

  if (data.length < period + 1) return result

  const changes: number[] = []
  for (let i = 1; i < data.length; i++) {
    changes.push(data[i]!.close - data[i - 1]!.close)
  }

  let sumGain = 0
  let sumLoss = 0

  for (let i = 0; i < period; i++) {
    const change = changes[i]
    if (change !== undefined) {
      if (change > 0) sumGain += change
      else sumLoss += Math.abs(change)
    }
  }

  let avgGain = sumGain / period
  let avgLoss = sumLoss / period

  if (avgLoss === 0) {
    result[period] = 100
  } else {
    const rs = avgGain / avgLoss
    result[period] = 100 - 100 / (1 + rs)
  }

  for (let i = period; i < changes.length; i++) {
    const change = changes[i]
    if (change === undefined) continue

    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period
      avgLoss = (avgLoss * (period - 1)) / period
    } else {
      avgGain = (avgGain * (period - 1)) / period
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period
    }

    if (avgLoss === 0) {
      result[i + 1] = 100
    } else {
      const rs = avgGain / avgLoss
      result[i + 1] = 100 - 100 / (1 + rs)
    }
  }

  return result
}

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

export interface STOCHPoint {
  k: number
  d: number
  j: number
}

export function calcSTOCHData(data: KLineData[], n: number, m: number): STOCHPoint[] {
  const result: STOCHPoint[] = new Array(data.length)

  if (data.length < n) return result

  const kValues: (number | undefined)[] = new Array(data.length)

  for (let i = n - 1; i < data.length; i++) {
    let highest = -Infinity
    let lowest = Infinity

    for (let j = 0; j < n; j++) {
      const item = data[i - j]
      if (!item) continue
      highest = Math.max(highest, item.high)
      lowest = Math.min(lowest, item.low)
    }

    const close = data[i]!.close
    if (highest === lowest) {
      kValues[i] = 50
    } else {
      kValues[i] = ((close - lowest) / (highest - lowest)) * 100
    }
  }

  for (let i = n - 1 + m - 1; i < data.length; i++) {
    const k = kValues[i]
    if (k === undefined) continue

    let sum = 0
    let validCount = 0
    for (let j = 0; j < m; j++) {
      const kv = kValues[i - j]
      if (kv !== undefined) {
        sum += kv
        validCount++
      }
    }

    if (validCount === m) {
      const d = sum / m
      result[i] = { k, d, j: 3 * k - 2 * d }
    }
  }

  return result
}

export function calcMOMData(data: KLineData[], period: number): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(data.length)

  if (data.length < period + 1) return result

  for (let i = period; i < data.length; i++) {
    const currentClose = data[i]?.close
    const prevClose = data[i - period]?.close

    if (currentClose !== undefined && prevClose !== undefined) {
      result[i] = currentClose - prevClose
    }
  }

  return result
}

export function calcWMSRData(data: KLineData[], period: number): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(data.length)

  if (data.length < period) return result

  for (let i = period - 1; i < data.length; i++) {
    let highest = -Infinity
    let lowest = Infinity

    for (let j = 0; j < period; j++) {
      const item = data[i - j]
      if (!item) continue
      highest = Math.max(highest, item.high)
      lowest = Math.min(lowest, item.low)
    }

    const close = data[i]!.close
    if (highest === lowest) {
      result[i] = -50
    } else {
      result[i] = ((highest - close) / (highest - lowest)) * -100
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

export function calcFASTKData(data: KLineData[], period: number): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(data.length)

  if (data.length < period) return result

  for (let i = period - 1; i < data.length; i++) {
    let highest = -Infinity
    let lowest = Infinity

    for (let j = 0; j < period; j++) {
      const item = data[i - j]
      if (!item) continue
      highest = Math.max(highest, item.high)
      lowest = Math.min(lowest, item.low)
    }

    const close = data[i]!.close
    if (highest === lowest) {
      result[i] = 50
    } else {
      result[i] = ((close - lowest) / (highest - lowest)) * 100
    }
  }

  return result
}

export interface MACDPoint {
  dif: number
  dea: number
  macd: number
}

function calcEMA(data: KLineData[], period: number): number[] {
  const result: number[] = new Array(data.length)
  const k = 2 / (period + 1)

  if (data.length === 0) return result

  result[0] = data[0]!.close

  for (let i = 1; i < data.length; i++) {
    const item = data[i]
    if (!item) continue
    result[i] = item.close * k + result[i - 1]! * (1 - k)
  }

  return result
}

function calcEMAFromArray(values: (number | undefined)[], period: number): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(values.length)
  const k = 2 / (period + 1)

  const firstValid = values.findIndex((v) => v !== undefined)
  if (firstValid === -1) return result

  result[firstValid] = values[firstValid]

  for (let i = firstValid + 1; i < values.length; i++) {
    const val = values[i]
    const prev = result[i - 1]
    if (val === undefined || prev === undefined) continue
    result[i] = val * k + prev * (1 - k)
  }

  return result
}

export function calcMACDData(
  data: KLineData[],
  fastPeriod: number,
  slowPeriod: number,
  signalPeriod: number,
): MACDPoint[] {
  const result: MACDPoint[] = new Array(data.length)

  if (data.length < slowPeriod) return result

  const emaFast = calcEMA(data, fastPeriod)
  const emaSlow = calcEMA(data, slowPeriod)

  const dif: (number | undefined)[] = new Array(data.length)
  for (let i = 0; i < data.length; i++) {
    const fast = emaFast[i]
    const slow = emaSlow[i]
    if (fast !== undefined && slow !== undefined) {
      dif[i] = fast - slow
    }
  }

  const dea = calcEMAFromArray(dif, signalPeriod)

  for (let i = 0; i < data.length; i++) {
    const d = dif[i]
    const e = dea[i]
    if (d !== undefined && e !== undefined) {
      result[i] = {
        dif: d,
        dea: e,
        macd: (d - e) * 2,
      }
    }
  }

  return result
}

export function calcROCData(data: KLineData[], period: number): (number | undefined)[] {
  const n = data.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)
  if (n === 0 || period <= 0) return result
  for (let t = period; t < n; t++) {
    const prev = data[t - period]!.close
    if (prev === 0) continue
    result[t] = ((data[t]!.close - prev) / prev) * 100
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
