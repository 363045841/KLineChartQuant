/** 线性回归结果，x 使用输入数组的序号，y 使用输入值。 */
export type LinearRegression = {
  slope: number
  intercept: number
  stdDev: number
}

/** 对有限数值做最小二乘拟合，并返回拟合线和残差标准差。 */
export function computeLinearRegression(values: ReadonlyArray<number>): LinearRegression | null {
  const n = values.length
  if (n < 2 || values.some((value) => !Number.isFinite(value))) return null

  const xMean = (n - 1) / 2
  const yMean = values.reduce((sum, value) => sum + value, 0) / n
  let xx = 0
  let xy = 0
  for (let i = 0; i < n; i++) {
    const x = i - xMean
    xx += x * x
    xy += x * (values[i]! - yMean)
  }
  if (xx === 0) return null

  const slope = xy / xx
  const intercept = yMean - slope * xMean
  let residualSum = 0
  for (let i = 0; i < n; i++) {
    const residual = values[i]! - (intercept + slope * i)
    residualSum += residual * residual
  }

  return { slope, intercept, stdDev: Math.sqrt(residualSum / n) }
}
