import type { KLineData } from '../../../foundation/types/price'

import { GMMA_LONG_PERIODS, GMMA_SHORT_PERIODS } from '../state/gmmaState'

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

export function calcSMMAData(data: KLineData[], period: number): (number | undefined)[] {
  const n = data.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)
  if (n === 0 || period <= 0 || n < period) return result

  // 种子：前 period 个收盘价的简单均值
  let sum = 0
  for (let i = 0; i < period; i++) sum += data[i]!.close
  let smma = sum / period
  result[period - 1] = smma

  // Wilder 递归平滑，仅用当前收盘价修正前值
  for (let i = period; i < n; i++) {
    smma = (smma * (period - 1) + data[i]!.close) / period
    result[i] = smma
  }

  return result
}

// TRIMA（三角移动平均）：TRIMA = SMA(SMA(source, ceil(period/2)), floor(period/2)+1)
export function calcTRIMAData(data: KLineData[], period: number): (number | undefined)[] {
  const n = data.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)

  if (n === 0 || period <= 0 || n < period) return result

  const firstPeriod = Math.ceil(period / 2)
  const secondPeriod = Math.floor(period / 2) + 1

  // 第一层 SMA：滑动窗口简单累加，输出从 firstPeriod-1 起连续有定义
  const firstMA: (number | undefined)[] = new Array(n).fill(undefined)
  let sum = 0
  for (let i = 0; i < firstPeriod; i++) {
    sum += data[i]!.close
  }
  firstMA[firstPeriod - 1] = sum / firstPeriod
  for (let i = firstPeriod; i < n; i++) {
    sum = sum - data[i - firstPeriod]!.close + data[i]!.close
    firstMA[i] = sum / firstPeriod
  }

  // 第二层 SMA：对第一层结果滑动求平均，中间出现 undefined 时重置窗口
  let sum2 = 0
  let count = 0
  for (let i = 0; i < n; i++) {
    const v = firstMA[i]
    if (v === undefined) {
      sum2 = 0
      count = 0
      continue
    }
    sum2 += v
    count++
    if (count > secondPeriod) {
      sum2 -= firstMA[i - secondPeriod]!
    }
    if (count >= secondPeriod) {
      result[i] = sum2 / secondPeriod
    }
  }

  return result
}

// ZLEMA（零滞后指数移动平均）：先构造零滞后源序列，再对其做 EMA
export function calcZLEMAData(data: KLineData[], period: number): (number | undefined)[] {
  const n = data.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)
  if (n === 0 || period <= 0 || n < period) return result

  const lag = Math.round((period - 1) / 2)

  // 零滞后源 = close + (close - close[i-lag])，索引不足 lag 时退化为 close 本身
  const zlSource: (number | undefined)[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const close = data[i]!.close
    zlSource[i] = i < lag ? close : close + (close - data[i - lag]!.close)
  }

  return _computeEMASeries(zlSource, period)
}

// VWMA（成交量加权移动平均）：VWMA = Σ(close*volume) / Σ(volume)，滑动窗口 O(n)
export function calcVWMAData(data: KLineData[], period: number): (number | undefined)[] {
  const n = data.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)
  if (n === 0 || period <= 0 || n < period) return result

  let pvSum = 0
  let vSum = 0
  for (let i = 0; i < period; i++) {
    const vol = data[i]!.volume ?? 0
    pvSum += data[i]!.close * vol
    vSum += vol
  }
  if (vSum > 0) result[period - 1] = pvSum / vSum

  for (let t = period; t < n; t++) {
    const inBar = data[t]!
    const outBar = data[t - period]!
    const inVol = inBar.volume ?? 0
    const outVol = outBar.volume ?? 0
    pvSum += inBar.close * inVol - outBar.close * outVol
    vSum += inVol - outVol
    if (vSum > 0) result[t] = pvSum / vSum
  }
  return result
}

// ALMA（Arnaud Legoux 移动平均）：高斯权重加权平均，权重偏向 offset 位置，降低噪声并减少滞后
export function calcALMAData(
  data: KLineData[],
  period: number,
  offset: number,
  sigma: number,
): (number | undefined)[] {
  const n = data.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)

  if (n === 0 || period <= 0 || sigma <= 0 || n < period) return result

  const m = Math.floor(offset * (period - 1))
  const s = period / sigma

  const weights: number[] = new Array(period)
  let weightSum = 0
  for (let k = 0; k < period; k++) {
    weights[k] = Math.exp(-((k - m) ** 2) / (2 * s * s))
    weightSum += weights[k]!
  }

  for (let i = period - 1; i < n; i++) {
    let sum = 0
    for (let k = 0; k < period; k++) {
      sum += weights[k]! * data[i - period + 1 + k]!.close
    }
    result[i] = sum / weightSum
  }

  return result
}

// LSMA（线性回归移动平均）：对每个窗口做最小二乘拟合，取回归线在窗口末端的值
export function calcLSMAData(data: KLineData[], period: number): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(data.length).fill(undefined)

  // 边界：空数据或非法周期直接返回全 undefined
  if (data.length === 0 || period <= 0) return result
  // 数据不足一个窗口，全部为 warmup
  if (data.length < period) return result

  const closes = new Array<number>(data.length)
  for (let i = 0; i < data.length; i++) closes[i] = data[i]!.close

  // Σx 与 Σx² 只与 period 相关，可预计算为常量
  const sumX = (period * (period - 1)) / 2
  const sumX2 = (period * (period - 1) * (2 * period - 1)) / 6
  const denominator = period * sumX2 - sumX * sumX

  // 初始化第一个窗口 [0, period-1] 的 Σy 与 Σxy
  let sumY = 0
  let sumXY = 0
  for (let i = 0; i < period; i++) {
    const close = closes[i]!
    sumY += close
    sumXY += close * i
  }

  // 回归系数与末端拟合值
  let slope = (period * sumXY - sumX * sumY) / denominator
  let intercept = (sumY - slope * sumX) / period
  result[period - 1] = intercept + slope * (period - 1)

  for (let i = period; i < data.length; i++) {
    const removed = closes[i - period]!
    const added = closes[i]!
    // 滑动窗口：剔除最旧、加入最新；Σxy 因整体左移一位，需减去剔除后的窗口 y 和
    sumY = sumY - removed + added
    sumXY = sumXY - (sumY - added) + added * (period - 1)

    slope = (period * sumXY - sumX * sumY) / denominator
    intercept = (sumY - slope * sumX) / period
    result[i] = intercept + slope * (period - 1)
  }

  return result
}

/**
 * DMA 单点：DIF = MA(close,p1) - MA(close,p2)，AMA = MA(DIF,p3)
 */
export interface DMAPoint {
  dif: number
  ama: number
}

// DMA（平行线差）：DIF 仅当 ma1/ma2 同点都有定义才输出；AMA 为 dif 的 p3 窗口简单平均
export function calcDMAData(
  data: KLineData[],
  p1: number,
  p2: number,
  p3: number,
): (DMAPoint | undefined)[] {
  const n = data.length
  const result: (DMAPoint | undefined)[] = new Array(n).fill(undefined)
  if (n === 0 || p1 <= 0 || p2 <= 0 || p3 <= 0) return result

  const ma1 = calcMAData(data, p1)
  const ma2 = calcMAData(data, p2)

  const dif: (number | undefined)[] = new Array(n).fill(undefined)
  for (let i = 0; i < n; i++) {
    const a = ma1[i]
    const b = ma2[i]
    if (a === undefined || b === undefined) continue
    dif[i] = a - b
  }

  // 滑动窗口对 dif 做 p3 简单平均，count 追踪窗口内已定义点数
  let sum = 0
  let count = 0
  for (let i = 0; i < n; i++) {
    const v = dif[i]
    if (v !== undefined) {
      sum += v
      count++
    }
    const left = i - p3
    if (left >= 0) {
      const out = dif[left]
      if (out !== undefined) {
        sum -= out
        count--
      }
    }
    // 窗口满且全部定义才输出 ama
    if (i >= p3 - 1 && count === p3) {
      result[i] = { dif: dif[i]!, ama: sum / p3 }
    }
  }

  return result
}

// GMMA（顾比均线）：对短/长两组固定周期分别计算收盘价 EMA，返回「周期 → 序列」映射
export function calcGMMAData(data: KLineData[]): Record<number, (number | undefined)[]> {
  const result: Record<number, (number | undefined)[]> = {}
  if (data.length === 0) return result

  const closes = new Array<number | undefined>(data.length)
  for (let i = 0; i < data.length; i++) closes[i] = data[i]!.close

  for (const period of [...GMMA_SHORT_PERIODS, ...GMMA_LONG_PERIODS]) {
    result[period] = _computeEMASeries(closes, period)
  }
  return result
}
