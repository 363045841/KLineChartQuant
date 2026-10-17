// 指标计算结果的属性断言：校验取值定义域与有限性。
type SparseSeries = readonly (number | undefined)[]

export function assertNonNegative(series: SparseSeries, label: string): void {
  for (let i = 0; i < series.length; i++) {
    const v = series[i]
    if (v !== undefined && v < 0) {
      throw new Error(`${label}: index ${i} should be ≥ 0, got ${v}`)
    }
  }
}

export function assertFiniteOrUndefined(series: SparseSeries, label: string): void {
  for (let i = 0; i < series.length; i++) {
    const v = series[i]
    if (v === undefined) continue
    if (!Number.isFinite(v)) {
      throw new Error(`${label}: index ${i} non-finite value ${v}`)
    }
  }
}
