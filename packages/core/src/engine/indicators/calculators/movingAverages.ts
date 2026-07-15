import type { KLineData } from '../../../foundation/types/price'

import { _computeEMASeries, _computeWMAOnNumbers } from './_shared'

export type MAFlags = {
  ma5?: boolean
  ma10?: boolean
  ma20?: boolean
  ma30?: boolean
  ma60?: boolean
}

export const DEFAULT_MA_PERIODS = [5, 10, 20, 30, 60] as const

export function calcMAData(data: KLineData[], period: number): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(data.length)

  if (data.length < period) return result

  let sum = 0

  for (let i = 0; i < period; i++) {
    const item = data[i]
    if (!item) return result
    sum += item.close
  }

  result[period - 1] = sum / period

  for (let i = period; i < data.length; i++) {
    const prevItem = data[i - period]
    const currItem = data[i]
    if (!prevItem || !currItem) continue

    sum = sum - prevItem.close + currItem.close
    result[i] = sum / period
  }

  return result
}

export interface EXPMAPoint {
  fast: number
  slow: number
}

export function calcEXPMAData(
  data: KLineData[],
  fastPeriod: number,
  slowPeriod: number,
): EXPMAPoint[] {
  const result: EXPMAPoint[] = new Array(data.length)

  if (data.length === 0) return result

  const fastK = 2 / (fastPeriod + 1)
  const slowK = 2 / (slowPeriod + 1)

  const firstClose = data[0]!.close
  let fastEMA = firstClose
  let slowEMA = firstClose

  result[0] = { fast: fastEMA, slow: slowEMA }

  for (let i = 1; i < data.length; i++) {
    const close = data[i]!.close
    fastEMA = close * fastK + fastEMA * (1 - fastK)
    slowEMA = close * slowK + slowEMA * (1 - slowK)
    result[i] = { fast: fastEMA, slow: slowEMA }
  }

  return result
}

export function calcWMAData(data: KLineData[], period: number): (number | undefined)[] {
  if (data.length === 0 || period <= 0) {
    return new Array(data.length).fill(undefined)
  }
  const closes = new Array<number | undefined>(data.length)
  for (let i = 0; i < data.length; i++) closes[i] = data[i]!.close
  return _computeWMAOnNumbers(closes, period)
}

export function calcDEMAData(data: KLineData[], period: number): (number | undefined)[] {
  const n = data.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)
  if (n === 0 || period <= 0) return result

  const closes = new Array<number | undefined>(n)
  for (let i = 0; i < n; i++) closes[i] = data[i]!.close

  const ema1 = _computeEMASeries(closes, period)
  const ema2 = _computeEMASeries(ema1, period)

  for (let i = 0; i < n; i++) {
    const e1 = ema1[i]
    const e2 = ema2[i]
    if (e1 === undefined || e2 === undefined) continue
    result[i] = 2 * e1 - e2
  }
  return result
}

export function calcTEMAData(data: KLineData[], period: number): (number | undefined)[] {
  const n = data.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)
  if (n === 0 || period <= 0) return result

  const closes = new Array<number | undefined>(n)
  for (let i = 0; i < n; i++) closes[i] = data[i]!.close

  const ema1 = _computeEMASeries(closes, period)
  const ema2 = _computeEMASeries(ema1, period)
  const ema3 = _computeEMASeries(ema2, period)

  for (let i = 0; i < n; i++) {
    const e1 = ema1[i]
    const e2 = ema2[i]
    const e3 = ema3[i]
    if (e1 === undefined || e2 === undefined || e3 === undefined) continue
    result[i] = 3 * e1 - 3 * e2 + e3
  }
  return result
}

export function calcHMAData(data: KLineData[], period: number): (number | undefined)[] {
  const n = data.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)
  if (n === 0 || period <= 0) return result

  const closes = new Array<number | undefined>(n)
  for (let i = 0; i < n; i++) closes[i] = data[i]!.close

  const halfPeriod = Math.max(1, Math.floor(period / 2))
  const sqrtPeriod = Math.max(1, Math.round(Math.sqrt(period)))

  const wmaHalf = _computeWMAOnNumbers(closes, halfPeriod)
  const wmaFull = _computeWMAOnNumbers(closes, period)

  const raw: (number | undefined)[] = new Array(n).fill(undefined)
  for (let i = 0; i < n; i++) {
    const h = wmaHalf[i]
    const f = wmaFull[i]
    if (h === undefined || f === undefined) continue
    raw[i] = 2 * h - f
  }
  return _computeWMAOnNumbers(raw, sqrtPeriod)
}

export function calcKAMAData(
  data: KLineData[],
  period: number,
  fastPeriod: number,
  slowPeriod: number,
): (number | undefined)[] {
  const n = data.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)
  if (n === 0 || period <= 0 || fastPeriod <= 0 || slowPeriod <= 0 || n <= period) return result

  const fastSC = 2 / (fastPeriod + 1)
  const slowSC = 2 / (slowPeriod + 1)
  const scRange = fastSC - slowSC

  let volSum = 0
  for (let i = 1; i <= period; i++) {
    volSum += Math.abs(data[i]!.close - data[i - 1]!.close)
  }

  let kama = data[period - 1]!.close
  result[period - 1] = kama

  for (let t = period; t < n; t++) {
    const close = data[t]!.close
    const closeNPeriodsAgo = data[t - period]!.close
    const direction = Math.abs(close - closeNPeriodsAgo)

    const er = volSum > 0 ? direction / volSum : 0
    const sc = (er * scRange + slowSC) ** 2

    kama = kama + sc * (close - kama)
    result[t] = kama

    if (t < n - 1) {
      volSum -= Math.abs(data[t - period + 1]!.close - data[t - period]!.close)
      volSum += Math.abs(data[t + 1]!.close - data[t]!.close)
    }
  }

  return result
}
