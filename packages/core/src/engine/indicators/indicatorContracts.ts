/** 系统指标身份和第三方定义名称；绘图状态由公共 Plot 契约表达。 */

export interface AuxiliaryIndicatorContracts {
  timeShare: unknown
  fiveDayTimeShare: unknown
  lastPriceLine: unknown
  lastPriceLabelRegistrar: unknown
  extremaMarkers: unknown
}

export type BuiltinIndicatorName = keyof AuxiliaryIndicatorContracts
export type IndicatorName = BuiltinIndicatorName | (string & {})
