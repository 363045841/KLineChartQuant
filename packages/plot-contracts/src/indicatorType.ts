/**
 * 指标业务分类词汇：选择器分组、Agent 与脚本声明共用同一份取值。
 *
 * 词汇放在叶子契约，core 与 script 才能共享同一组字符串而不互相依赖。
 */

/** 可扩展的业务分类注册表；扩展分类由使用方通过 declaration merging 补充。 */
export interface IndicatorTypeRegistry {
  'moving-average': unknown
  trend: unknown
  momentum: unknown
  volatility: unknown
  channel: unknown
  volume: unknown
  'support-resistance': unknown
  structure: unknown
  other: unknown
}

/** 指标业务分类 ID。 */
export type IndicatorType = keyof IndicatorTypeRegistry

/** 内置业务分类取值；VM 枚举与跨边界校验共用，宿主不重复书写字符串。 */
export const IndicatorType = {
  MovingAverage: 'moving-average',
  Trend: 'trend',
  Momentum: 'momentum',
  Volatility: 'volatility',
  Channel: 'channel',
  Volume: 'volume',
  SupportResistance: 'support-resistance',
  Structure: 'structure',
  Other: 'other',
} satisfies Record<string, IndicatorType>

/** 校验跨 VM 边界的业务分类。 */
export function isIndicatorType(value: unknown): value is IndicatorType {
  return Object.values(IndicatorType).some((entry) => entry === value)
}
