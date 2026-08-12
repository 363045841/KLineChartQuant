/**
 * T3 指标计算器
 * 基于收盘价执行 Tim Tillson 六层 EMA 平滑，并以 undefined 表示预热区间。
 */
import type { KLineData } from '../../../foundation/types/price'

/**
 * 计算 T3 单线序列。
 * @param data K 线数据
 * @param period EMA 周期，必须为不小于 2 的整数
 * @param volumeFactor 平滑体积因子，取值范围为 [0, 1]
 * @returns 与输入等长的 T3 序列，预热和非法参数位置为 undefined
 */
export function calcT3Data(
  data: KLineData[],
  period: number,
  volumeFactor: number,
): (number | undefined)[] {
  const n = data.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)

  if (
    n === 0 ||
    n < period ||
    !Number.isInteger(period) ||
    period < 2 ||
    !Number.isFinite(volumeFactor) ||
    volumeFactor < 0 ||
    volumeFactor > 1
  ) {
    return result
  }

  const alpha = 2 / (period + 1)
  const firstClose = data[0]!.close
  let ema1 = firstClose
  let ema2 = firstClose
  let ema3 = firstClose
  let ema4 = firstClose
  let ema5 = firstClose
  let ema6 = firstClose

  const factorSquared = volumeFactor * volumeFactor
  const factorCubed = factorSquared * volumeFactor
  const c1 = -factorCubed
  const c2 = 3 * factorSquared + 3 * factorCubed
  const c3 = -6 * factorSquared - 3 * volumeFactor - 3 * factorCubed
  const c4 = 1 + 3 * volumeFactor + factorCubed + 3 * factorSquared

  // 先从首根 K 线连续递推 EMA，再隐藏主引擎约定的 period - 1 预热结果。
  for (let i = 1; i < n; i++) {
    const close = data[i]!.close
    ema1 = alpha * close + (1 - alpha) * ema1
    ema2 = alpha * ema1 + (1 - alpha) * ema2
    ema3 = alpha * ema2 + (1 - alpha) * ema3
    ema4 = alpha * ema3 + (1 - alpha) * ema4
    ema5 = alpha * ema4 + (1 - alpha) * ema5
    ema6 = alpha * ema5 + (1 - alpha) * ema6

    if (i >= period - 1) {
      result[i] = c1 * ema6 + c2 * ema5 + c3 * ema4 + c4 * ema3
    }
  }

  return result
}
