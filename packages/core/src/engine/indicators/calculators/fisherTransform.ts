/**
 * Fisher Transform 计算器：使用 K 线中位价将价格波动映射为 Fisher 与信号线。
 */

import type { KLineData } from '../../../foundation/types/price'

export interface FisherPoint {
  fisher: number
  signal: number
}

/**
 * 计算 Fisher Transform 序列。
 * @param data K 线数据。
 * @param period 中位价归一化窗口周期。
 * @returns 与输入等长的 Fisher/Signal 点序列，未就绪或参数非法的位置为 undefined。
 */
export function calcFisherTransformData(
  data: KLineData[],
  period: number,
): (FisherPoint | undefined)[] {
  const result: (FisherPoint | undefined)[] = new Array(data.length).fill(undefined)
  if (!Number.isInteger(period) || period < 2) return result

  let value = 0
  let fisher = 0

  for (let i = period - 1; i < data.length; i++) {
    let highest = -Infinity
    let lowest = Infinity

    for (let j = i - period + 1; j <= i; j++) {
      const median = getMedianPrice(data[j]!)
      highest = Math.max(highest, median)
      lowest = Math.min(lowest, median)
    }

    const median = getMedianPrice(data[i]!)
    const range = highest - lowest
    const normalized = range === 0 ? 0 : (median - lowest) / range
    const raw = 2 * (normalized - 0.5)
    value = clamp(0.33 * raw + 0.67 * value, -0.999, 0.999)

    const nextFisher = 0.5 * Math.log((1 + value) / (1 - value)) + 0.5 * fisher
    result[i] = { fisher: nextFisher, signal: fisher }
    fisher = nextFisher
  }

  return result
}

/**
 * 计算 K 线的高低中位价。
 * @param data 单根 K 线数据。
 * @returns 中位价。
 */
function getMedianPrice(data: KLineData): number {
  return (data.high + data.low) / 2
}

/**
 * 将数值限制在闭区间内，避免 Fisher 对数函数无穷大。
 * @param value 待限制数值。
 * @param min 最小值。
 * @param max 最大值。
 * @returns 限制后的数值。
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
