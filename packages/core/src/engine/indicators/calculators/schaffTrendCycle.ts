/**
 * Schaff Trend Cycle 计算器：对 MACD 依次进行两次随机化和因子平滑。
 */

import type { KLineData } from '../../../foundation/types/price'

/**
 * 计算 Schaff Trend Cycle 序列。
 * @param data K 线数据。
 * @param fast 快速 EMA 周期。
 * @param slow 慢速 EMA 周期。
 * @param cycle 随机化窗口周期。
 * @param factor 平滑因子，范围为 (0, 1]。
 * @returns 与输入等长的 STC 序列，未就绪或参数非法的位置为 undefined。
 */
export function calcSchaffTrendCycleData(
  data: KLineData[],
  fast: number,
  slow: number,
  cycle: number,
  factor: number,
): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(data.length).fill(undefined)

  if (
    !Number.isInteger(fast) ||
    !Number.isInteger(slow) ||
    !Number.isInteger(cycle) ||
    !Number.isFinite(factor) ||
    fast < 2 ||
    slow <= fast ||
    cycle < 2 ||
    factor <= 0 ||
    factor > 1
  ) {
    return result
  }

  const macd = calculateMACD(data, fast, slow)
  const firstStochastic = calculateStochastic(macd, cycle)
  const firstSmoothed = smoothByFactor(firstStochastic, factor)
  const secondStochastic = calculateStochastic(firstSmoothed, cycle)
  return smoothByFactor(secondStochastic, factor)
}

/**
 * 计算快速与慢速 EMA 的差值。
 * @param data K 线数据。
 * @param fast 快速 EMA 周期。
 * @param slow 慢速 EMA 周期。
 * @returns 与输入等长的 MACD 差值序列。
 */
function calculateMACD(data: KLineData[], fast: number, slow: number): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(data.length).fill(undefined)
  if (data.length === 0) return result

  const fastMultiplier = 2 / (fast + 1)
  const slowMultiplier = 2 / (slow + 1)
  let fastEma = data[0]!.close
  let slowEma = data[0]!.close
  result[0] = 0

  for (let i = 1; i < data.length; i++) {
    const close = data[i]!.close
    fastEma = fastMultiplier * close + (1 - fastMultiplier) * fastEma
    slowEma = slowMultiplier * close + (1 - slowMultiplier) * slowEma
    result[i] = fastEma - slowEma
  }

  return result
}

/**
 * 在稀疏数值序列上计算随机指标。
 * @param values 输入数值序列。
 * @param period 回溯窗口周期。
 * @returns 与输入等长的随机指标序列。
 */
function calculateStochastic(
  values: (number | undefined)[],
  period: number,
): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(values.length).fill(undefined)

  for (let i = period - 1; i < values.length; i++) {
    const current = values[i]
    if (current === undefined) continue

    let lowest = Infinity
    let highest = -Infinity
    let validCount = 0
    for (let j = i - period + 1; j <= i; j++) {
      const value = values[j]
      if (value === undefined) continue
      lowest = Math.min(lowest, value)
      highest = Math.max(highest, value)
      validCount++
    }

    if (validCount !== period) continue
    const range = highest - lowest
    result[i] = range === 0 ? 50 : (100 * (current - lowest)) / range
  }

  return result
}

/**
 * 使用指定因子递归平滑数值序列。
 * @param values 输入稀疏数值序列。
 * @param factor 新值权重。
 * @returns 与输入等长的平滑序列。
 */
function smoothByFactor(values: (number | undefined)[], factor: number): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(values.length).fill(undefined)
  let previous: number | undefined

  for (let i = 0; i < values.length; i++) {
    const value = values[i]
    if (value === undefined) continue

    previous = previous === undefined ? value : factor * value + (1 - factor) * previous
    result[i] = previous
  }

  return result
}
