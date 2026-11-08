/** 回归通道模型：统一回归计算、端点方向和通道宽度。 */

import type { PriceSpace } from '../types.js'
import { computeLinearRegression, type LinearRegression } from './linearRegression.js'
import { fromPriceSpace } from './priceSpace.js'

export type RegressionChannelModel = {
  startIndex: number
  endIndex: number
  /** 拟合线在两个数据索引处的价格。 */
  firstValue: number
  secondValue: number
  /** 通道半宽，单位与 `space` 一致：对数轴为对数差，即上下轨是同比例缩放。 */
  deviation: number
  sigma: number
  space: PriceSpace
  regression: LinearRegression
}

/**
 * 根据两个数据索引生成回归通道，端点顺序可以与数据顺序相反。
 *
 * 拟合与半宽都在 `space` 内计算：对数轴上回归线在屏幕上是直线，上下轨与回归线
 * 保持等比例间距。价格由空间值转回，因此调用方拿到的仍是可直接绘制的价格。
 * @param values 价格序列
 * @param firstIndex 第一个端点的数据索引
 * @param secondIndex 第二个端点的数据索引
 * @param sigma 通道宽度倍数
 * @param space 运算空间
 * @returns 回归通道模型；数据不足或无法在对数轴表示时为 null
 */
export function computeRegressionChannel(
  values: ReadonlyArray<number>,
  firstIndex: number,
  secondIndex: number,
  sigma: number,
  space: PriceSpace,
): RegressionChannelModel | null {
  if (values.length < 2) return null
  if (!Number.isInteger(firstIndex) || !Number.isInteger(secondIndex)) return null

  const startIndex = Math.min(firstIndex, secondIndex)
  const endIndex = Math.max(firstIndex, secondIndex)
  if (startIndex < 0 || endIndex >= values.length) return null

  const regression = computeLinearRegression(values.slice(startIndex, endIndex + 1), space)
  if (!regression) return null

  const resolvedSigma = Number.isFinite(sigma) && sigma >= 0 ? sigma : 2
  const valueAt = (index: number) =>
    fromPriceSpace(regression.intercept + regression.slope * (index - startIndex), space)

  return {
    startIndex,
    endIndex,
    firstValue: valueAt(firstIndex),
    secondValue: valueAt(secondIndex),
    deviation: regression.stdDev * resolvedSigma,
    sigma: resolvedSigma,
    space,
    regression,
  }
}
