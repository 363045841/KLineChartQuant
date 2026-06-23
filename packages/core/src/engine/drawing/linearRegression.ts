export function computeLinearRegression(values: number[]): { slope: number; intercept: number; stdDev: number } | null {
  const n = values.length
  if (n < 2) return null

  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXX = 0
  for (let i = 0; i < n; i++) {
    const x = i
    const y = values[i]!
    sumX += x
    sumY += y
    sumXY += x * y
    sumXX += x * x
  }

  const denominator = n * sumXX - sumX * sumX
  if (denominator === 0) return null

  const slope = (n * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / n

  let variance = 0
  for (let i = 0; i < n; i++) {
    const fitted = intercept + slope * i
    const diff = values[i]! - fitted
    variance += diff * diff
  }

  return {
    slope,
    intercept,
    stdDev: Math.sqrt(variance / n),
  }
}
