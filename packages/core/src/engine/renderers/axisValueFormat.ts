/** 价格轴刻度与价签的统一文本格式化与展示语义解析。 */
import {
  AXIS_DISPLAY,
  type AxisDisplaySetting,
  resolveEffectiveAxisDisplay,
} from '../../foundation/config/axisSettings.js'
import type { RenderContext } from '../../foundation/plugin/index.js'

/**
 * 按轴展示语义格式化价格：价格原样两位小数，百分比带正负号与百分号。
 *
 * @param value - 已按该轴语义换算后的值（percent 时为百分比数值）
 * @param isPercent - 是否为百分比轴
 */
export function formatAxisPriceValue(value: number, isPercent: boolean): string {
  if (!isPercent) return value.toFixed(2)
  const sign = value >= 0 ? '+' : ''
  return sign + value.toFixed(2) + '%'
}

/**
 * 解析价格轴当前的展示语义：分时强制价格，比较视图取百分比。
 *
 * @param context - 当前渲染上下文
 * @returns 该轴应展示的标签语义
 */
export function resolvePriceAxisDisplay(context: RenderContext): AxisDisplaySetting {
  return resolveEffectiveAxisDisplay('right', {
    period: context.period,
    comparisonActive: (context.comparisonSymbols?.length ?? 0) > 0,
    leftSetting: context.settings?.mainLeftAxisDisplaySetting,
    rightTypeSetting: context.settings?.mainRightAxisTypeSetting,
  })
}

/**
 * 判断当前轴与 pane 是否按百分比展示；副图恒为价格。
 *
 * @param context - 当前渲染上下文
 * @returns 是否需要把价格换算为百分比
 */
export function usesPercentAxis(context: RenderContext): boolean {
  return resolvePriceAxisDisplay(context) === AXIS_DISPLAY.PERCENT && context.pane.role === 'price'
}
