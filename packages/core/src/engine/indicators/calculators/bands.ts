import type { KLineData } from '../../../foundation/types/price'

import { _computeEMASeries } from './_shared'
import { calcATRData } from './volatility'

export interface BOLLPoint {
  upper: number
  middle: number
  lower: number
}

export function calcBOLLData(data: KLineData[], period: number, multiplier: number): BOLLPoint[] {
  const result: BOLLPoint[] = new Array(data.length)

  if (data.length < period) return result

  let sum = 0
  const window: number[] = []

  for (let i = 0; i < period; i++) {
    const item = data[i]
    if (!item) return result
    const close = item.close
    window.push(close)
    sum += close
  }

  for (let i = period - 1; i < data.length; i++) {
    const item = data[i]
    if (!item) continue

    if (i >= period) {
      const oldVal = window.shift()
      if (oldVal !== undefined) sum -= oldVal
      const close = item.close
      window.push(close)
      sum += close
    }

    const ma = sum / period

    let variance = 0
    for (let j = 0; j < period; j++) {
      const wVal = window[j]
      if (wVal !== undefined) {
        variance += Math.pow(wVal - ma, 2)
      }
    }
    const stdDev = Math.sqrt(variance / period)

    result[i] = {
      upper: ma + multiplier * stdDev,
      middle: ma,
      lower: ma - multiplier * stdDev,
    }
  }

  return result
}

export interface ENEPoint {
  upper: number
  middle: number
  lower: number
}

export function calcENEData(data: KLineData[], period: number, deviation: number): ENEPoint[] {
  const result: ENEPoint[] = new Array(data.length)

  if (data.length < period) return result

  let sum = 0

  for (let i = 0; i < period; i++) {
    const item = data[i]
    if (!item) return result
    sum += item.close
  }

  const firstMA = sum / period
  const firstDeviation = deviation / 100
  result[period - 1] = {
    upper: firstMA * (1 + firstDeviation),
    middle: firstMA,
    lower: firstMA * (1 - firstDeviation),
  }

  for (let i = period; i < data.length; i++) {
    const prevItem = data[i - period]
    const currItem = data[i]
    if (!prevItem || !currItem) continue

    sum = sum - prevItem.close + currItem.close
    const ma = sum / period
    const dev = deviation / 100

    result[i] = {
      upper: ma * (1 + dev),
      middle: ma,
      lower: ma * (1 - dev),
    }
  }

  return result
}

export interface SARPoint {
  value: number
  trend: 'up' | 'down'
}

export function calcSARData(
  data: KLineData[],
  step: number,
  maxStep: number,
): (SARPoint | undefined)[] {
  const n = data.length
  const result: (SARPoint | undefined)[] = new Array(n).fill(undefined)
  if (n < 2 || step <= 0 || maxStep <= 0) return result

  let trend: 'up' | 'down' = data[1]!.close >= data[0]!.close ? 'up' : 'down'
  let sar = trend === 'up' ? data[0]!.low : data[0]!.high
  let ep = trend === 'up' ? data[0]!.high : data[0]!.low
  let af = step

  result[0] = { value: sar, trend }

  for (let t = 1; t < n; t++) {
    const bar = data[t]!
    sar = sar + af * (ep - sar)

    if (trend === 'up') {
      const cap1 = data[t - 1]!.low
      const cap2 = t >= 2 ? data[t - 2]!.low : cap1
      sar = Math.min(sar, cap1, cap2)
    } else {
      const cap1 = data[t - 1]!.high
      const cap2 = t >= 2 ? data[t - 2]!.high : cap1
      sar = Math.max(sar, cap1, cap2)
    }

    if (trend === 'up' && bar.low < sar) {
      trend = 'down'
      sar = ep
      ep = bar.low
      af = step
    } else if (trend === 'down' && bar.high > sar) {
      trend = 'up'
      sar = ep
      ep = bar.high
      af = step
    } else {
      if (trend === 'up' && bar.high > ep) {
        ep = bar.high
        af = Math.min(af + step, maxStep)
      } else if (trend === 'down' && bar.low < ep) {
        ep = bar.low
        af = Math.min(af + step, maxStep)
      }
    }

    result[t] = { value: sar, trend }
  }

  return result
}

export interface SuperTrendPoint {
  value: number
  trend: 'up' | 'down'
}

export function calcSuperTrendData(
  data: KLineData[],
  atrPeriod: number,
  multiplier: number,
): (SuperTrendPoint | undefined)[] {
  const n = data.length
  const result: (SuperTrendPoint | undefined)[] = new Array(n).fill(undefined)
  if (n === 0 || atrPeriod <= 0 || multiplier <= 0) return result

  const atr = calcATRData(data, atrPeriod)

  let trend: 'up' | 'down' = 'up'
  let prevUpper = Infinity
  let prevLower = -Infinity

  for (let t = 0; t < n; t++) {
    const bar = data[t]!
    const a = atr[t]
    if (a === undefined) continue

    const hl2 = (bar.high + bar.low) / 2
    const upperBasic = hl2 + multiplier * a
    const lowerBasic = hl2 - multiplier * a

    const prevClose = t > 0 ? data[t - 1]!.close : bar.close
    const upper = upperBasic < prevUpper || prevClose > prevUpper ? upperBasic : prevUpper
    const lower = lowerBasic > prevLower || prevClose < prevLower ? lowerBasic : prevLower

    if (trend === 'up' && bar.close < lower) {
      trend = 'down'
    } else if (trend === 'down' && bar.close > upper) {
      trend = 'up'
    }

    result[t] = { value: trend === 'up' ? lower : upper, trend }

    prevUpper = upper
    prevLower = lower
  }

  return result
}

export interface KeltnerPoint {
  upper: number
  middle: number
  lower: number
}

export function calcKeltnerData(
  data: KLineData[],
  emaPeriod: number,
  atrPeriod: number,
  multiplier: number,
): (KeltnerPoint | undefined)[] {
  const n = data.length
  const result: (KeltnerPoint | undefined)[] = new Array(n).fill(undefined)
  if (n === 0 || emaPeriod <= 0 || atrPeriod <= 0) return result

  const closes = new Array<number | undefined>(n)
  for (let i = 0; i < n; i++) closes[i] = data[i]!.close

  const ema = _computeEMASeries(closes, emaPeriod)
  const atr = calcATRData(data, atrPeriod)

  for (let t = 0; t < n; t++) {
    const m = ema[t]
    const a = atr[t]
    if (m === undefined || a === undefined) continue
    result[t] = {
      upper: m + multiplier * a,
      middle: m,
      lower: m - multiplier * a,
    }
  }
  return result
}

export interface DonchianPoint {
  upper: number
  middle: number
  lower: number
}

export function calcDonchianData(data: KLineData[], period: number): (DonchianPoint | undefined)[] {
  const n = data.length
  const result: (DonchianPoint | undefined)[] = new Array(n).fill(undefined)
  if (n === 0 || period <= 0 || n < period) return result

  for (let t = period - 1; t < n; t++) {
    let hi = -Infinity
    let lo = Infinity
    for (let k = 0; k < period; k++) {
      const bar = data[t - k]!
      if (bar.high > hi) hi = bar.high
      if (bar.low < lo) lo = bar.low
    }
    result[t] = { upper: hi, middle: (hi + lo) / 2, lower: lo }
  }
  return result
}

export interface IchimokuPoint {
  tenkan?: number
  kijun?: number
  spanA?: number
  spanB?: number
  chikou?: number
}

function _rollingMidline(data: KLineData[], period: number): (number | undefined)[] {
  const n = data.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)
  if (n < period || period <= 0) return result
  for (let t = period - 1; t < n; t++) {
    let hi = -Infinity
    let lo = Infinity
    for (let k = 0; k < period; k++) {
      const bar = data[t - k]!
      if (bar.high > hi) hi = bar.high
      if (bar.low < lo) lo = bar.low
    }
    result[t] = (hi + lo) / 2
  }
  return result
}

export function calcIchimokuData(
  data: KLineData[],
  tenkanPeriod: number,
  kijunPeriod: number,
  spanBPeriod: number,
  displacement: number,
): (IchimokuPoint | undefined)[] {
  const n = data.length
  const totalLen = n + displacement
  const result: (IchimokuPoint | undefined)[] = new Array(totalLen).fill(undefined)
  if (n === 0 || tenkanPeriod <= 0 || kijunPeriod <= 0 || spanBPeriod <= 0) {
    return result.slice(0, n)
  }

  const tenkan = _rollingMidline(data, tenkanPeriod)
  const kijun = _rollingMidline(data, kijunPeriod)
  const spanBSource = _rollingMidline(data, spanBPeriod)

  for (let t = 0; t < n; t++) {
    const point: IchimokuPoint = {}
    if (tenkan[t] !== undefined) point.tenkan = tenkan[t]
    if (kijun[t] !== undefined) point.kijun = kijun[t]

    const src = t - displacement
    if (src >= 0) {
      if (tenkan[src] !== undefined && kijun[src] !== undefined) {
        point.spanA = (tenkan[src]! + kijun[src]!) / 2
      }
      if (spanBSource[src] !== undefined) {
        point.spanB = spanBSource[src]
      }
    }

    const future = t + displacement
    if (future < n) point.chikou = data[future]!.close

    result[t] = point
  }

  for (let f = 0; f < displacement; f++) {
    const t = n + f
    const src = t - displacement
    const point: IchimokuPoint = {}
    if (src >= 0 && src < n) {
      if (tenkan[src] !== undefined && kijun[src] !== undefined) {
        point.spanA = (tenkan[src]! + kijun[src]!) / 2
      }
      if (spanBSource[src] !== undefined) {
        point.spanB = spanBSource[src]
      }
    }
    result[t] = point
  }

  return result
}
