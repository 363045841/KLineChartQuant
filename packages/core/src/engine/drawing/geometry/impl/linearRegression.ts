/** 线性回归结果，x 使用输入数组的序号，y 使用输入值在运算空间内的度量。 */

import type { PriceSpace } from '../types.js'
import { toPriceSpace } from './priceSpace.js'

export type LinearRegression = {
  slope: number
  intercept: number
  stdDev: number
}

/**
 * 对有限数值做最小二乘拟合，并返回拟合线和残差标准差。
 *
 * 输入按 `space` 映射后再拟合：对数轴上拟合的是对数价格，因此拟合线在屏幕上仍是
 * 直线，残差也按对数度量。任一输入无法映射（例如对数轴遇到非正价格）时返回 null。
 * @param values 价格序列
 * @param space 运算空间
 * @returns 斜率、截距与残差标准差（均在运算空间内）；无法拟合时为 null
 */
export function computeLinearRegression(
  values: ReadonlyArray<number>,
  space: PriceSpace,
): LinearRegression | null {
  const n = values.length
  if (n < 2) return null

  const mapped: number[] = []
  for (const value of values) {
    const point = toPriceSpace(value, space)
    if (!Number.isFinite(point)) return null
    mapped.push(point)
  }

  const xMean = (n - 1) / 2
  const yMean = mapped.reduce((sum, value) => sum + value, 0) / n
  let xx = 0
  let xy = 0
  for (let i = 0; i < n; i++) {
    const x = i - xMean
    xx += x * x
    xy += x * (mapped[i]! - yMean)
  }
  if (xx === 0) return null

  const slope = xy / xx
  const intercept = yMean - slope * xMean
  let residualSum = 0
  for (let i = 0; i < n; i++) {
    const residual = mapped[i]! - (intercept + slope * i)
    residualSum += residual * residual
  }

  return { slope, intercept, stdDev: Math.sqrt(residualSum / n) }
}
