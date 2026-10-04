import type { PriceRange } from './price.js'

/**
 * LogFormula 接口
 * 用于对数变换的动态偏移，保证极小值下的精度
 *
 * - logicalOffset: 逻辑偏移，使输出值落在合理范围
 * - coordOffset: 坐标偏移，避免 log10(0) 并提升精度
 */
export interface LogFormula {
  logicalOffset: number
  coordOffset: number
}

/** 默认 LogFormula */
const DEFAULT_FORMULA: LogFormula = {
  logicalOffset: 4,
  coordOffset: 0.0001,
}

/**
 * 判断数值是否近似为零
 */
function isZero(value: number): boolean {
  return Math.abs(value) < 1e-15
}

/**
 * 真实价格 → log 逻辑空间
 * 公式: sign(price) * (log10(|price| + coordOffset) + logicalOffset)
 *
 * @param price 真实价格（可为负数）
 * @param f LogFormula
 * @returns log 逻辑空间值
 */
export function toLog(price: number, f: LogFormula): number {
  const m = Math.abs(price)
  if (isZero(m)) {
    return 0
  }
  const res = Math.log10(m + f.coordOffset) + f.logicalOffset
  return price < 0 ? -res : res
}

/**
 * log 逻辑空间 → 真实价格
 * 公式: sign(logical) * (10^(|logical| - logicalOffset) - coordOffset)
 *
 * @param logical log 逻辑空间值
 * @param f LogFormula
 * @returns 真实价格
 */
export function fromLog(logical: number, f: LogFormula): number {
  const m = Math.abs(logical)
  if (isZero(m)) {
    return 0
  }
  const res = Math.pow(10, m - f.logicalOffset) - f.coordOffset
  return logical < 0 ? -res : res
}

/**
 * 根据价格范围动态计算 LogFormula
 *
 * 对于常规价格范围 (diff >= 1)，使用默认值。
 * 对于极小价格范围 (diff < 1)，自动增大 logicalOffset 以维持精度。
 *
 * @param range 价格范围，可为 null
 * @returns 最优的 LogFormula
 */
export function logFormulaForPriceRange(range: PriceRange | null): LogFormula {
  if (range === null) {
    return { ...DEFAULT_FORMULA }
  }

  const diff = Math.abs(range.maxPrice - range.minPrice)
  // 常规范围或无效范围，使用默认公式
  if (diff >= 1 || diff < 1e-15) {
    return { ...DEFAULT_FORMULA }
  }

  // 极小范围：根据精度需求增大偏移
  // 例如 diff = 0.0001 (1e-4)，需要增加 4 位偏移
  const digits = Math.ceil(Math.abs(Math.log10(diff)))
  const logicalOffset = DEFAULT_FORMULA.logicalOffset + digits
  const coordOffset = 1 / Math.pow(10, logicalOffset)

  return { logicalOffset, coordOffset }
}

/**
 * 范围转 log 空间
 * 将价格的 min/max 都转换到 log 空间
 *
 * @param range 真实价格范围
 * @param f LogFormula
 * @returns log 空间的价格范围
 */
export function convertPriceRangeToLog(range: PriceRange, f: LogFormula): PriceRange {
  return {
    minPrice: toLog(range.minPrice, f),
    maxPrice: toLog(range.maxPrice, f),
  }
}

/**
 * 范围从 log 空间转回
 * 将 log 空间的 min/max 转换回真实价格
 *
 * @param range log 空间的价格范围
 * @param f LogFormula
 * @returns 真实价格范围
 */
export function convertPriceRangeFromLog(range: PriceRange, f: LogFormula): PriceRange {
  return {
    minPrice: fromLog(range.minPrice, f),
    maxPrice: fromLog(range.maxPrice, f),
  }
}

/**
 * 判断两个 LogFormula 是否相同
 *
 * @param a LogFormula A
 * @param b LogFormula B
 * @returns 是否相同
 */
export function logFormulasAreSame(a: LogFormula, b: LogFormula): boolean {
  return a.logicalOffset === b.logicalOffset && a.coordOffset === b.coordOffset
}
