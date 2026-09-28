/**
 * 主图右轴类型偏好、左轴展示偏好，以及当前生效展示语义。
 * Setting 是用户偏好；paneScaleTypes 与 effective display 由模式覆盖后供运行时读取。
 */

import { isTimeSharePeriod } from '../types/chartPeriod.js'
import { AXIS_TYPE_NONE, type AxisType, ScaleType } from '../types/scaleType.js'

/** 主图右轴类型偏好，同时决定坐标怎么算、右轴标签怎么显示 */
export type RightAxisTypeSetting = AxisType

/** 从右轴类型推导出的坐标类型；none 时坐标仍用 linear */
export type PriceScaleTypeSetting = ScaleType

/** 轴标签展示 */
export const AXIS_DISPLAY = {
  NONE: 'none',
  PRICE: 'price',
  PERCENT: 'percent',
} as const
export type AxisDisplaySetting = (typeof AXIS_DISPLAY)[keyof typeof AXIS_DISPLAY]

export type EffectiveAxisDisplayInput = {
  period?: string
  comparisonActive?: boolean
  leftSetting?: AxisDisplaySetting
  rightTypeSetting?: RightAxisTypeSetting
}

/** 将右轴类型收敛为坐标类型；none / 未知值回退 linear */
export function resolvePriceScaleTypeSetting(value: unknown): PriceScaleTypeSetting {
  if (value === ScaleType.Log || value === ScaleType.Percent) return value
  return ScaleType.Linear
}

/** 将未知值收敛为右轴类型偏好 */
export function resolveRightAxisTypeSetting(value: unknown): RightAxisTypeSetting {
  if (
    value === AXIS_TYPE_NONE ||
    value === ScaleType.Linear ||
    value === ScaleType.Log ||
    value === ScaleType.Percent
  )
    return value
  return ScaleType.Linear
}

/** 将未知值收敛为轴展示偏好 */
export function resolveAxisDisplaySetting(
  value: unknown,
  fallback: AxisDisplaySetting,
): AxisDisplaySetting {
  if (value === AXIS_DISPLAY.NONE || value === AXIS_DISPLAY.PRICE || value === AXIS_DISPLAY.PERCENT)
    return value
  return fallback
}

/** 右轴类型对应的标签语义：none 隐藏，percent 显示涨跌幅，linear/log 显示价格 */
export function resolveRightAxisDisplayFromType(type: unknown): AxisDisplaySetting {
  if (type === AXIS_TYPE_NONE) return AXIS_DISPLAY.NONE
  if (type === ScaleType.Percent) return AXIS_DISPLAY.PERCENT
  return AXIS_DISPLAY.PRICE
}

/**
 * 当前轴应展示的标签语义。
 * 分时强制左百分比、右价格；比较视图右轴默认百分比，用户选 none 仍隐藏。
 */
export function resolveEffectiveAxisDisplay(
  side: 'left' | 'right',
  input: EffectiveAxisDisplayInput,
): AxisDisplaySetting {
  if (isTimeSharePeriod(input.period))
    return side === 'left' ? AXIS_DISPLAY.PERCENT : AXIS_DISPLAY.PRICE
  const rightDisplay = resolveRightAxisDisplayFromType(input.rightTypeSetting)
  if (input.comparisonActive && side === 'right') {
    return rightDisplay === AXIS_DISPLAY.NONE ? AXIS_DISPLAY.NONE : AXIS_DISPLAY.PERCENT
  }
  return side === 'left' ? (input.leftSetting ?? AXIS_DISPLAY.NONE) : rightDisplay
}

/** 按坐标偏好生成各 pane 的生效刻度；percent 只作用于价格 pane */
export function buildPaneScaleTypesFromSetting(
  paneRoles: ReadonlyArray<{ id: string; role: string }>,
  setting: PriceScaleTypeSetting,
): Map<string, PriceScaleTypeSetting> {
  const next = new Map<string, PriceScaleTypeSetting>()
  for (const pane of paneRoles) {
    next.set(
      pane.id,
      setting === ScaleType.Percent && pane.role !== 'price' ? ScaleType.Linear : setting,
    )
  }
  return next
}
