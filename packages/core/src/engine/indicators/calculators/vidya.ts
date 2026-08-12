/**
 * VIDYA 指标计算器
 * 基于收盘价的 CMO 自适应 EMA 计算单线 VIDYA，并以 undefined 表示预热区间。
 */
import type { KLineData } from '../../../foundation/types/price'

/**
 * 计算 VIDYA 单线序列。
 * @param data K 线数据
 * @param period 基础 EMA 周期，必须为不小于 2 的整数
 * @param cmoPeriod CMO 滚动窗口，必须为正整数
 * @returns 与输入等长的 VIDYA 序列，预热和非法参数位置为 undefined
 */
export function calcVIDYAData(
  data: KLineData[],
  period: number,
  cmoPeriod: number,
): (number | undefined)[] {
  const n = data.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)

  if (
    n === 0 ||
    n < period ||
    !Number.isInteger(period) ||
    period < 2 ||
    !Number.isInteger(cmoPeriod) ||
    cmoPeriod < 1
  ) {
    return result
  }

  const baseAlpha = 2 / (period + 1)
  const firstVisibleIndex = Math.max(period - 1, cmoPeriod)
  let gainSum = 0
  let lossSum = 0
  let vidya: number | undefined

  for (let i = 1; i < n; i++) {
    const close = data[i]!.close
    const previousClose = data[i - 1]!.close
    const difference = close - previousClose

    if (difference > 0) gainSum += difference
    else if (difference < 0) lossSum -= difference

    // 移除滑出 CMO 窗口的价格变动，始终保持恰好 cmoPeriod 个差分。
    if (i > cmoPeriod) {
      const expiredDifference = data[i - cmoPeriod]!.close - data[i - cmoPeriod - 1]!.close
      if (expiredDifference > 0) gainSum -= expiredDifference
      else if (expiredDifference < 0) lossSum += expiredDifference
    }

    if (i < cmoPeriod) continue

    const denominator = gainSum + lossSum
    const cmoMagnitude = denominator === 0 ? 0 : Math.abs((gainSum - lossSum) / denominator)
    const alpha = baseAlpha * cmoMagnitude

    if (vidya === undefined) vidya = close
    else vidya = alpha * close + (1 - alpha) * vidya

    if (i >= firstVisibleIndex) result[i] = vidya
  }

  return result
}
