/**
 * StochRSI 计算器：基于收盘价先计算 RSI，再计算随机指标的 K/D 平滑线。
 */

import type { KLineData } from '@/foundation/types/price.js'
import { _computeStochastic } from './_shared.js'

export interface StochRSIPoint {
  k: number
  d: number
}

/**
 * 计算 StochRSI 序列。
 * @param data K 线数据。
 * @param period RSI 与随机窗口周期。
 * @param kPeriod K 线 SMA 平滑周期。
 * @param dPeriod D 线 SMA 平滑周期。
 * @returns 与输入等长的 K/D 点序列，未就绪或参数非法的位置为 undefined。
 */
export function calcStochRSIData(
  data: KLineData[],
  period: number,
  kPeriod: number,
  dPeriod: number,
): (StochRSIPoint | undefined)[] {
  const result: (StochRSIPoint | undefined)[] = new Array(data.length).fill(undefined)

  if (
    !Number.isInteger(period) ||
    !Number.isInteger(kPeriod) ||
    !Number.isInteger(dPeriod) ||
    period < 2 ||
    kPeriod < 1 ||
    dPeriod < 1
  ) {
    return result
  }

  const rsi = calculateRSI(data, period)
  const rawK = _computeStochastic(rsi, period)
  const kValues = calculateSMA(rawK, kPeriod)
  const dValues = calculateSMA(kValues, dPeriod)

  for (let i = 0; i < data.length; i++) {
    const k = kValues[i]
    const d = dValues[i]
    if (k !== undefined && d !== undefined) {
      result[i] = { k, d }
    }
  }

  return result
}

/**
 * 计算收盘价 RSI 序列。
 * @param data K 线数据。
 * @param period RSI 周期。
 * @returns 与输入等长的 RSI 序列。
 */
function calculateRSI(data: KLineData[], period: number): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(data.length).fill(undefined)
  if (data.length < period + 1) return result

  let gainSum = 0
  let lossSum = 0
  for (let i = 1; i <= period; i++) {
    const change = data[i]!.close - data[i - 1]!.close
    if (change > 0) gainSum += change
    else lossSum -= change
  }

  let averageGain = gainSum / period
  let averageLoss = lossSum / period
  result[period] = calculateRSIValue(averageGain, averageLoss)

  for (let i = period + 1; i < data.length; i++) {
    const change = data[i]!.close - data[i - 1]!.close
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? -change : 0
    averageGain = (averageGain * (period - 1) + gain) / period
    averageLoss = (averageLoss * (period - 1) + loss) / period
    result[i] = calculateRSIValue(averageGain, averageLoss)
  }

  return result
}

/**
 * 根据平均涨跌幅计算单个 RSI 值。
 * @param averageGain 平均上涨幅度。
 * @param averageLoss 平均下跌幅度。
 * @returns RSI 数值。
 */
function calculateRSIValue(averageGain: number, averageLoss: number): number {
  if (averageLoss === 0) return 100
  const relativeStrength = averageGain / averageLoss
  return 100 - 100 / (1 + relativeStrength)
}

/**
 * 在连续有效值上计算简单移动平均。
 * @param values 输入稀疏数值序列。
 * @param period 移动窗口周期。
 * @returns 与输入等长的 SMA 序列。
 */
function calculateSMA(values: (number | undefined)[], period: number): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(values.length).fill(undefined)
  let sum = 0
  let validCount = 0

  for (let i = 0; i < values.length; i++) {
    const value = values[i]
    if (value === undefined) {
      sum = 0
      validCount = 0
      continue
    }

    sum += value
    validCount++

    if (validCount > period) {
      sum -= values[i - period]!
      validCount--
    }

    if (validCount === period) {
      result[i] = sum / period
    }
  }

  return result
}
