/**
 * FRAMA 指标计算器
 * 沿用纯函数版本的收盘价区间近似，按分形维数自适应调整 EMA 平滑系数。
 */
import type { KLineData } from '../../../foundation/types/price'

/**
 * 计算指定收盘价区间的最高值和最低值。
 * @param data K 线数据
 * @param start 区间起始索引
 * @param end 区间结束索引（不含）
 * @returns 收盘价区间的极值
 */
function getCloseRange(
  data: KLineData[],
  start: number,
  end: number,
): { max: number; min: number } {
  let max = -Infinity
  let min = Infinity

  for (let i = start; i < end; i++) {
    const close = data[i]!.close
    if (close > max) max = close
    if (close < min) min = close
  }

  return { max, min }
}

/**
 * 计算 FRAMA 单线序列。
 * @param data K 线数据
 * @param period 分形窗口，必须为不小于 4 的偶数
 * @returns 与输入等长的 FRAMA 序列，预热和非法参数位置为 undefined
 */
export function calcFRAMAData(data: KLineData[], period: number): (number | undefined)[] {
  const n = data.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)

  if (n === 0 || n < period || !Number.isInteger(period) || period < 4 || period % 2 !== 0) {
    return result
  }

  const halfPeriod = period / 2
  let frama: number | undefined

  for (let i = period - 1; i < n; i++) {
    const fullStart = i - period + 1
    const firstHalf = getCloseRange(data, fullStart, fullStart + halfPeriod)
    const secondHalf = getCloseRange(data, fullStart + halfPeriod, fullStart + period)
    const fullRange = getCloseRange(data, fullStart, fullStart + period)
    const n1 = (firstHalf.max - firstHalf.min) / halfPeriod
    const n2 = (secondHalf.max - secondHalf.min) / halfPeriod
    const n3 = (fullRange.max - fullRange.min) / period

    let alpha: number
    if (n1 <= 0 || n2 <= 0 || n3 <= 0) {
      alpha = 2 / (period + 1)
    } else {
      const dimension = (Math.log(n1 + n2) - Math.log(n3)) / Math.LN2
      alpha = Math.exp(-4.6 * (dimension - 1))
      if (!(alpha > 0)) alpha = 0.01
      if (alpha > 1) alpha = 1
    }

    const close = data[i]!.close
    if (frama === undefined) frama = close
    else frama = alpha * close + (1 - alpha) * frama
    result[i] = frama
  }

  return result
}
