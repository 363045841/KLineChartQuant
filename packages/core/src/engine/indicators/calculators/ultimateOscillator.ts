/**
 * Ultimate Oscillator 计算器：按多周期买压与真实波幅比率加权计算 UO。
 */

import type { KLineData } from '../../../foundation/types/price'

/**
 * 计算 Ultimate Oscillator 序列。
 * @param data K 线数据。
 * @param p1 第一买压周期。
 * @param p2 第二买压周期。
 * @param p3 第三买压周期。
 * @returns 与输入等长的 UO 序列，未就绪或参数非法的位置为 undefined。
 */
export function calcUltimateOscillatorData(
  data: KLineData[],
  p1: number,
  p2: number,
  p3: number,
): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(data.length).fill(undefined)

  if (
    !Number.isInteger(p1) ||
    !Number.isInteger(p2) ||
    !Number.isInteger(p3) ||
    p1 < 1 ||
    p2 < 1 ||
    p3 < 1
  ) {
    return result
  }

  const buyingPressure: number[] = new Array(data.length)
  const trueRange: number[] = new Array(data.length)

  for (let i = 0; i < data.length; i++) {
    const bar = data[i]!
    if (i === 0) {
      buyingPressure[i] = 0
      trueRange[i] = bar.high - bar.low
      continue
    }

    const previousClose = data[i - 1]!.close
    const minLow = Math.min(bar.low, previousClose)
    buyingPressure[i] = bar.close - minLow
    trueRange[i] = Math.max(bar.high, previousClose) - minLow
  }

  const ratio1 = calculateRollingRatio(buyingPressure, trueRange, p1)
  const ratio2 = calculateRollingRatio(buyingPressure, trueRange, p2)
  const ratio3 = calculateRollingRatio(buyingPressure, trueRange, p3)
  const maxPeriod = Math.max(p1, p2, p3)

  for (let i = maxPeriod; i < data.length; i++) {
    const r1 = ratio1[i]
    const r2 = ratio2[i]
    const r3 = ratio3[i]
    if (r1 === undefined || r2 === undefined || r3 === undefined) continue

    result[i] = (100 * (4 * r1 + 2 * r2 + r3)) / 7
  }

  return result
}

/**
 * 计算买压和真实波幅的滚动比率。
 * @param numerator 分子序列。
 * @param denominator 分母序列。
 * @param period 滚动窗口长度。
 * @returns 与输入等长的滚动比率序列。
 */
function calculateRollingRatio(
  numerator: number[],
  denominator: number[],
  period: number,
): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(numerator.length).fill(undefined)
  let numeratorSum = 0
  let denominatorSum = 0

  for (let i = 0; i < numerator.length; i++) {
    numeratorSum += numerator[i]!
    denominatorSum += denominator[i]!
    if (i >= period) {
      numeratorSum -= numerator[i - period]!
      denominatorSum -= denominator[i - period]!
    }

    if (i < period - 1 || denominatorSum === 0) continue

    const ratio = numeratorSum / denominatorSum
    if (Number.isFinite(ratio)) result[i] = ratio
  }

  return result
}
