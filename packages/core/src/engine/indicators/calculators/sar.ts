/** 尚未迁移的抛物线转向指标计算。 */
import type { KLineData } from '@/foundation/types/price.js'

export interface SARPoint {
  value: number
  trend: 'up' | 'down'
}

/** 按趋势、极值与加速因子逐根计算 SAR。 */
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
