/**
 * DPO 计算器：把收盘价转换为去趋势价格振荡器序列。
 */

import type { KLineData } from '../../../foundation/types/price'

/**
 * 计算 DPO 序列。
 * @param data K 线数据。
 * @param period SMA 周期，必须是大于等于 2 的整数。
 * @returns 与输入等长的 DPO 序列，未就绪或参数非法的位置为 undefined。
 */
export function calcDPOData(data: KLineData[], period: number): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(data.length).fill(undefined)

  if (!Number.isInteger(period) || period < 2) return result

  const shift = Math.floor(period / 2) + 1
  let sum = 0

  for (let i = 0; i < data.length; i++) {
    sum += data[i]!.close
    if (i >= period) sum -= data[i - period]!.close
    if (i < period - 1) continue

    const back = i - shift
    if (back >= 0) result[i] = data[back]!.close - sum / period
  }

  return result
}
