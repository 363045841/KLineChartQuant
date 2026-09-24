/** 价格轴（左/右）刻度与价签的统一文本格式化。 */

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
