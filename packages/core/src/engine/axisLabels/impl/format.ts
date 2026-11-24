/** 值轴列的文本格式化：显示单位、精度与逐标签格式覆盖的唯一实现。 */

import type { Format } from '@363045841yyt/klinechart-plot-contracts'
import type { PaneAxisSpec } from '@/engine/pane/axisTypes.js'
import { formatPlotValue } from '@/engine/plots/impl/plotValueFormat.js'
import {
  formatScaleValue,
  resolveAdaptiveDecimals,
} from '@/engine/renderers/Indicator/scale/scaleFormat.js'
import type { PaneInfo } from '@/foundation/plugin/index.js'
import { ScaleType } from '@/foundation/types/scaleType.js'
import type { AxisColumnProjection } from '../types.js'

/** 列的显示单位：'axis' 跟随轴语义（百分比 / 自定义格式），'raw' 始终显示原始价。 */
type ValueColumnUnit = 'axis' | 'raw'

/**
 * 构造值轴列的投影。
 *
 * @param axis 所属轴的坐标映射
 * @param spec 轴规格：精度下限与自定义格式
 * @param unit 显示单位
 * @returns 值 → 纵坐标与值 → 文本的列投影
 */
export function createValueProjection(
  axis: PaneInfo['yAxis'],
  spec: Pick<PaneAxisSpec, 'decimals' | 'format'>,
  unit: ValueColumnUnit,
): AxisColumnProjection {
  const decimals = resolveAdaptiveDecimals(axis.getDisplayRange(), spec.decimals)
  const percent = unit === 'axis' && axis.getScaleType() === ScaleType.Percent
  const base = (value: number): string => {
    if (unit === 'axis' && spec.format) return spec.format(value)
    if (!percent) return formatScaleValue(value, decimals)
    const pct = axis.toPercent(value)
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(decimals)}%`
  }
  return {
    kind: 'value',
    yFor: (value) => axis.priceToY(value),
    textFor: (value, format) =>
      format === undefined ? base(value) : formatPlotValue(format, value),
  }
}
