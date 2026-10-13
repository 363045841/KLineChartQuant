export function _computeEMASeries(
  values: (number | undefined)[],
  period: number,
): (number | undefined)[] {
  const n = values.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)
  if (n === 0 || period <= 0) return result

  const alpha = 2 / (period + 1)

  let i = 0
  while (i < n && values[i] === undefined) i++
  if (i >= n) return result

  let ema = values[i]!
  result[i] = ema
  for (let t = i + 1; t < n; t++) {
    const v = values[t]
    if (v === undefined) continue
    ema = v * alpha + ema * (1 - alpha)
    result[t] = ema
  }
  return result
}

export function _computeWMAOnNumbers(
  values: (number | undefined)[],
  period: number,
): (number | undefined)[] {
  const n = values.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)
  if (n === 0 || period <= 0 || n < period) return result

  const denom = (period * (period + 1)) / 2

  for (let t = period - 1; t < n; t++) {
    let sw = 0
    let valid = true
    for (let k = 0; k < period; k++) {
      const v = values[t - period + 1 + k]
      if (v === undefined) {
        valid = false
        break
      }
      sw += (k + 1) * v
    }
    if (valid) result[t] = sw / denom
  }
  return result
}

/**
 * 在稀疏数值序列上计算随机指标 K 值。
 * @param values 输入稀疏数值序列。
 * @param period 回溯窗口周期。
 * @returns 与输入等长的未平滑随机指标序列；窗口内有效点不足处留空。
 */
export function _computeStochastic(
  values: (number | undefined)[],
  period: number,
): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(values.length).fill(undefined)

  for (let i = period - 1; i < values.length; i++) {
    const current = values[i]
    if (current === undefined) continue

    let lowest = Infinity
    let highest = -Infinity
    let validCount = 0
    for (let j = i - period + 1; j <= i; j++) {
      const value = values[j]
      if (value === undefined) continue
      lowest = Math.min(lowest, value)
      highest = Math.max(highest, value)
      validCount++
    }

    if (validCount !== period) continue
    const range = highest - lowest
    result[i] = range === 0 ? 50 : (100 * (current - lowest)) / range
  }

  return result
}
