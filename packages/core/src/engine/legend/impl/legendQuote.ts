/**
 * 图例行情读数的唯一格式化入口：价格、涨跌与成交量/额。
 *
 * K 线与分时共用同一套基准、符号、精度与颜色规则，投影层只提供原始数值，
 * 避免两条路径各自拼文本后发生格式漂移。
 */

import type { ColorTokens } from '@/foundation/tokens/index.js'
import type { LegendBarChange, LegendText } from '../types.js'
import { LEGEND_READOUT_GAP_PX } from './legendGeometry.js'

/** 图例价格统一保留两位小数。 */
export function formatLegendPrice(value: number): string {
  return value.toFixed(2)
}

/** 涨跌额/涨跌幅正数补 + 号，其余按两位小数展示。 */
export function formatLegendSigned(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`
}

/** 成交量/成交额按中文 “万/亿” 缩写，保留两位小数。 */
export function formatLegendQuantity(value: number): string {
  if (value >= 1e8) return (value / 1e8).toFixed(2) + '亿'
  if (value >= 1e4) return (value / 1e4).toFixed(2) + '万'
  return value.toFixed(2)
}

/** 涨跌颜色：正为涨色、负为跌色，零与缺失用正文色。 */
export function legendChangeColor(value: number | null, colors: ColorTokens): string {
  if (value === null || value === 0) return colors.text.primary
  return value > 0 ? colors.candleUpBody : colors.candleDownBody
}

/**
 * 以基准价计算涨跌额、涨跌幅与文本颜色。
 *
 * 基准必须是正的有限数（前收、前一根收盘价），当前价必须是有限数；
 * 任一侧无效时返回 null，图例省略涨跌文本，不伪造 0%。
 */
export function resolveLegendChange(
  current: unknown,
  baseline: unknown,
  colors: ColorTokens,
): LegendBarChange | null {
  if (typeof baseline !== 'number' || !Number.isFinite(baseline) || baseline <= 0) return null
  if (typeof current !== 'number' || !Number.isFinite(current)) return null
  const amount = current - baseline
  const percent = (amount / baseline) * 100
  return { amount, percent, color: legendChangeColor(percent, colors) }
}

/** 涨跌额与涨跌幅是一组读数，统一格式为 `+2.00 (+20.00%)`，组内只空 1/4 格。 */
export function formatLegendChange(change: LegendBarChange): LegendText[] {
  return [
    { text: formatLegendSigned(change.amount), color: change.color },
    {
      text: `(${formatLegendSigned(change.percent)}%)`,
      color: change.color,
      gapBefore: LEGEND_READOUT_GAP_PX,
    },
  ]
}
