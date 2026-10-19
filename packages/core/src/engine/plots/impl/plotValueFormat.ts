/** Plot 数值文本格式化：把指标级/plot 级 format 档位映射为展示字符串。 */
import { Format, type Format as FormatValue } from '@363045841yyt/klinechart-plot-contracts'
import { formatScaleValue } from '@/engine/renderers/Indicator/scale/scaleFormat.js'

const BILLION = 1e9
const MILLION = 1e6
const THOUSAND = 1e3

/** 成交量按英文 K、M、B 量级缩写，坐标轴与图例共用。 */
function formatVolumeValue(value: number): string {
  if (Math.abs(value) >= BILLION) return `${(value / BILLION).toFixed(2)}B`
  if (Math.abs(value) >= MILLION) return `${(value / MILLION).toFixed(2)}M`
  if (Math.abs(value) >= THOUSAND) return `${(value / THOUSAND).toFixed(2)}K`
  return value.toFixed(2)
}

/**
 * 把数值格式档位映射为展示文本。
 *
 * - price：三位小数，与图例默认一致
 * - volume：K/M/B 量级缩写
 * - percent：数值原样附加百分号
 * - mintick：保留原始精度，不做缩写或补齐
 */
export function formatPlotValue(format: FormatValue, value: number): string {
  switch (format) {
    case Format.Volume:
      return formatVolumeValue(value)
    case Format.Percent:
      return `${value.toFixed(2)}%`
    case Format.Mintick:
      return String(value)
    case Format.Price:
      return formatScaleValue(value, 3)
  }
}
