// 指标周期可见性判定：把图表周期解析成「单位 + 数值」，再与指标声明的可见范围比较。
import type { KLinePeriod } from '../../data/provider/types.js'
import type { IndicatorPeriodUnit, IndicatorPeriodVisibility } from './indicatorMetadata.js'

/** 周期解析结果：单位与同单位内的数值。 */
export interface ParsedIndicatorPeriod {
  readonly unit: IndicatorPeriodUnit
  readonly value: number
}

/** 周期到单位/数值的静态映射；顺序即枚举顺序。 */
const PERIOD_PARTS: Readonly<Record<string, ParsedIndicatorPeriod>> = {
  '1min': { unit: 'minute', value: 1 },
  '5min': { unit: 'minute', value: 5 },
  '15min': { unit: 'minute', value: 15 },
  '30min': { unit: 'minute', value: 30 },
  '60min': { unit: 'minute', value: 60 },
  '4h': { unit: 'hour', value: 4 },
  daily: { unit: 'day', value: 1 },
  weekly: { unit: 'week', value: 1 },
  monthly: { unit: 'month', value: 1 },
  quarterly: { unit: 'quarter', value: 1 },
  yearly: { unit: 'month', value: 12 },
}

/**
 * 解析图表周期。
 * @param period 图表周期
 * @returns 单位与数值；未知周期返回 undefined
 */
export function parseIndicatorPeriod(
  period: KLinePeriod | string,
): ParsedIndicatorPeriod | undefined {
  return PERIOD_PARTS[period]
}

/**
 * 判断指标在当前周期是否可见。
 * 未声明范围时始终可见（向后兼容既有指标）。
 * @param period 当前图表周期
 * @param ranges 指标声明的可见范围
 * @returns 是否可见
 */
export function isIndicatorVisibleOnPeriod(
  period: KLinePeriod | string,
  ranges: readonly IndicatorPeriodVisibility[] | undefined,
): boolean {
  if (ranges === undefined || ranges.length === 0) return true
  const parsed = parseIndicatorPeriod(period)
  if (parsed === undefined) return true
  return ranges.some((range) => {
    if (range.unit !== parsed.unit) return false
    if (range.min !== undefined && parsed.value < range.min) return false
    if (range.max !== undefined && parsed.value > range.max) return false
    return true
  })
}
