/**
 * 主图右轴类型偏好、左轴展示偏好，以及当前生效展示语义。
 * Setting 是用户偏好；paneScaleTypes 与 effective display 由模式覆盖后供运行时读取。
 */

import { isTimeSharePeriod } from '../types/chartPeriod'

/** 主图右轴类型偏好，同时决定坐标怎么算、右轴标签怎么显示 */
export type RightAxisTypeSetting = 'none' | 'linear' | 'log' | 'percent'

/** 从右轴类型推导出的坐标类型；none 时坐标仍用 linear */
export type PriceScaleTypeSetting = 'linear' | 'log' | 'percent'

/** 轴标签展示 */
export type AxisDisplaySetting = 'none' | 'price' | 'percent'

export type EffectiveAxisDisplayInput = {
  period?: string
  comparisonActive?: boolean
  leftSetting?: AxisDisplaySetting
  rightTypeSetting?: RightAxisTypeSetting
}

/** 将右轴类型收敛为坐标类型；none / 未知值回退 linear */
export function resolvePriceScaleTypeSetting(value: unknown): PriceScaleTypeSetting {
  if (value === 'log' || value === 'percent') return value
  return 'linear'
}

/** 将未知值收敛为右轴类型偏好 */
export function resolveRightAxisTypeSetting(value: unknown): RightAxisTypeSetting {
  if (value === 'none' || value === 'linear' || value === 'log' || value === 'percent') return value
  return 'linear'
}

/** 将未知值收敛为轴展示偏好 */
export function resolveAxisDisplaySetting(
  value: unknown,
  fallback: AxisDisplaySetting,
): AxisDisplaySetting {
  if (value === 'none' || value === 'price' || value === 'percent') return value
  return fallback
}

/** 右轴类型对应的标签语义：none 隐藏，percent 显示涨跌幅，linear/log 显示价格 */
export function resolveRightAxisDisplayFromType(type: unknown): AxisDisplaySetting {
  if (type === 'none') return 'none'
  if (type === 'percent') return 'percent'
  return 'price'
}

/**
 * 当前轴应展示的标签语义。
 * 分时强制左百分比、右价格；比较视图右轴默认百分比，用户选 none 仍隐藏。
 */
export function resolveEffectiveAxisDisplay(
  side: 'left' | 'right',
  input: EffectiveAxisDisplayInput,
): AxisDisplaySetting {
  if (isTimeSharePeriod(input.period)) return side === 'left' ? 'percent' : 'price'
  const rightDisplay = resolveRightAxisDisplayFromType(input.rightTypeSetting)
  if (input.comparisonActive && side === 'right') {
    return rightDisplay === 'none' ? 'none' : 'percent'
  }
  return side === 'left' ? (input.leftSetting ?? 'none') : rightDisplay
}

/** 按坐标偏好生成各 pane 的生效刻度；percent 只作用于价格 pane */
export function buildPaneScaleTypesFromSetting(
  paneRoles: ReadonlyArray<{ id: string; role: string }>,
  setting: PriceScaleTypeSetting,
): Map<string, PriceScaleTypeSetting> {
  const next = new Map<string, PriceScaleTypeSetting>()
  for (const pane of paneRoles) {
    next.set(pane.id, setting === 'percent' && pane.role !== 'price' ? 'linear' : setting)
  }
  return next
}

/**
 * 将旧键迁到 mainRightAxisTypeSetting / mainLeftAxisDisplaySetting。
 * 已有新字段时以新字段为准。
 */
export function migrateAxisSettings(stored: Record<string, unknown>): Record<string, unknown> {
  const {
    rightAxisType,
    leftAxisType,
    mainPriceScaleTypeSetting,
    mainLeftAxisDisplaySetting,
    mainRightAxisDisplaySetting,
    mainRightAxisTypeSetting,
    ...rest
  } = stored

  const next: Record<string, unknown> = { ...rest }

  if (
    mainRightAxisTypeSetting === 'none' ||
    mainRightAxisTypeSetting === 'linear' ||
    mainRightAxisTypeSetting === 'log' ||
    mainRightAxisTypeSetting === 'percent'
  ) {
    next.mainRightAxisTypeSetting = mainRightAxisTypeSetting
  } else if (
    rightAxisType === 'none' ||
    rightAxisType === 'linear' ||
    rightAxisType === 'log' ||
    rightAxisType === 'percent'
  ) {
    next.mainRightAxisTypeSetting = rightAxisType
  } else if (mainRightAxisDisplaySetting === 'none') {
    next.mainRightAxisTypeSetting = 'none'
  } else if (mainRightAxisDisplaySetting === 'percent') {
    next.mainRightAxisTypeSetting = 'percent'
  } else if (
    mainPriceScaleTypeSetting === 'linear' ||
    mainPriceScaleTypeSetting === 'log' ||
    mainPriceScaleTypeSetting === 'percent'
  ) {
    next.mainRightAxisTypeSetting = mainPriceScaleTypeSetting
  }

  if (
    mainLeftAxisDisplaySetting === 'none' ||
    mainLeftAxisDisplaySetting === 'price' ||
    mainLeftAxisDisplaySetting === 'percent'
  ) {
    next.mainLeftAxisDisplaySetting = mainLeftAxisDisplaySetting
  } else if (leftAxisType === 'none' || leftAxisType === 'price' || leftAxisType === 'percent') {
    next.mainLeftAxisDisplaySetting = leftAxisType
  }

  return next
}
