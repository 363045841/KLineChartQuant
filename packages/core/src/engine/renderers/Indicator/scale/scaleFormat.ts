/**
 * 指标坐标轴刻度格式化工具
 * 提供按显示范围自适应的小数位推导与统一的数值格式化（消除 "-0.00"）。
 */

/** 自适应小数位上限，避免极小范围产生过长的刻度文本。 */
export const MAX_SCALE_DECIMALS = 6

/**
 * 根据显示范围推导刻度小数位
 * @param range 当前坐标轴显示范围
 * @param minDecimals 小数位下限
 * @param maxDecimals 小数位上限
 * @returns 建议小数位
 */
export function resolveAdaptiveDecimals(
  range: { minPrice: number; maxPrice: number },
  minDecimals = 2,
  maxDecimals = MAX_SCALE_DECIMALS,
): number {
  const span = Math.abs(range.maxPrice - range.minPrice)
  if (!Number.isFinite(span) || span <= 0) return minDecimals
  // 范围每缩小一个数量级，小数位增加一位；结果夹在上下限之间。
  const magnitude = Math.floor(Math.log10(span))
  return Math.min(maxDecimals, Math.max(minDecimals, 2 - magnitude))
}

/**
 * 格式化刻度数值
 * 四舍五入后为 0 的负值统一输出正零，避免坐标轴出现 "-0.00"。
 */
export function formatScaleValue(value: number, decimals: number): string {
  const text = value.toFixed(decimals)
  return Number(text) === 0 ? (0).toFixed(decimals) : text
}
