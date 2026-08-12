/**
 * Awesome Oscillator 计算器：使用 K 线中位价比较快慢 SMA。
 */

import type { KLineData } from '../../../foundation/types/price'

/**
 * 计算 Awesome Oscillator 序列。
 * @param data K 线数据。
 * @param fast 快速 SMA 周期。
 * @param slow 慢速 SMA 周期，必须大于 fast。
 * @returns 与输入等长的 AO 序列，未就绪或参数非法的位置为 undefined。
 */
export function calcAwesomeOscillatorData(
  data: KLineData[],
  fast: number,
  slow: number,
): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(data.length).fill(undefined)

  if (!Number.isInteger(fast) || !Number.isInteger(slow) || fast < 1 || slow < 1 || fast >= slow) {
    return result
  }

  const medianPrices = data.map((item) => (item.high + item.low) / 2)
  const fastSma = calculateSMA(medianPrices, fast)
  const slowSma = calculateSMA(medianPrices, slow)

  for (let i = 0; i < data.length; i++) {
    const fastValue = fastSma[i]
    const slowValue = slowSma[i]
    if (fastValue !== undefined && slowValue !== undefined) {
      result[i] = fastValue - slowValue
    }
  }

  return result
}

/**
 * 计算数值数组的简单移动平均。
 * @param values 输入数值。
 * @param period 移动窗口长度。
 * @returns 与输入等长的 SMA 序列。
 */
function calculateSMA(values: number[], period: number): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(values.length).fill(undefined)
  let sum = 0

  for (let i = 0; i < values.length; i++) {
    sum += values[i]!
    if (i >= period) sum -= values[i - period]!
    if (i >= period - 1) result[i] = sum / period
  }

  return result
}
