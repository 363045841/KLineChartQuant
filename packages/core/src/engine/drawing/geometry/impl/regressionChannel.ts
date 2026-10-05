/** 回归通道模型：统一回归计算、端点方向和通道宽度。 */

import { computeLinearRegression, type LinearRegression } from './linearRegression.js'

export type RegressionChannelModel = {
  startIndex: number
  endIndex: number
  firstValue: number
  secondValue: number
  offset: number
  sigma: number
  regression: LinearRegression
}

/** 根据两个数据索引生成回归通道，端点顺序可以与数据顺序相反。 */
export function computeRegressionChannel(
  values: ReadonlyArray<number>,
  firstIndex: number,
  secondIndex: number,
  sigma: number,
): RegressionChannelModel | null {
  if (values.length < 2) return null
  if (!Number.isInteger(firstIndex) || !Number.isInteger(secondIndex)) return null

  const startIndex = Math.min(firstIndex, secondIndex)
  const endIndex = Math.max(firstIndex, secondIndex)
  if (startIndex < 0 || endIndex >= values.length) return null

  const regression = computeLinearRegression(values.slice(startIndex, endIndex + 1))
  if (!regression) return null

  const resolvedSigma = Number.isFinite(sigma) && sigma >= 0 ? sigma : 2
  const valueAt = (index: number) => regression.intercept + regression.slope * (index - startIndex)

  return {
    startIndex,
    endIndex,
    firstValue: valueAt(firstIndex),
    secondValue: valueAt(secondIndex),
    offset: regression.stdDev * resolvedSigma,
    sigma: resolvedSigma,
    regression,
  }
}
