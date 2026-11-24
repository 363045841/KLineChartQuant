/**
 * 指标输出标签：每个价格定位的可见 plot 与参考线取最后一个有效值。
 *
 * 轴归属来自对象绑定（对象 → 轴由 `PaneAxisSpec.objectIds` 唯一决定），
 * 来源不接收任何轴参数。
 */

import type { Plot, PlotPoint, ScalarPlot } from '@363045841yyt/klinechart-plot-contracts'
import { plotIndexEnd, plotPointAt } from '@363045841yyt/klinechart-plot-contracts'
import { isPlotRenderState } from '@/engine/plots/impl/readPlotState.js'
import type { AxisLabel, AxisLabelScope, AxisLabelSource } from '../types.js'

/** OHLC 与事件标记没有单一轴值，不产出轴标签。 */
function isAxisValuePlot(plot: Plot): plot is ScalarPlot {
  return (
    plot.kind !== 'candle' &&
    plot.kind !== 'bar' &&
    plot.kind !== 'shape' &&
    plot.kind !== 'char' &&
    plot.kind !== 'arrow'
  )
}

/**
 * 最后一个有效点：按显示下标从末尾向前跳过空值与 NaN，颜色取同一点的最终值。
 *
 * @param plot 价格定位的标量输出
 * @returns 有效点；整列无效时为 null
 */
function lastPoint(plot: ScalarPlot): PlotPoint | null {
  for (let index = plotIndexEnd(plot) - 1; index >= 0; index--) {
    const point = plotPointAt(plot, index)
    if (point !== undefined && Number.isFinite(point.value)) return point
  }
  return null
}

export const indicatorOutputsSource: AxisLabelSource = {
  collect(scope: AxisLabelScope): readonly AxisLabel[] {
    const labels: AxisLabel[] = []
    for (const spec of scope.axes) {
      if (!spec.visible) continue
      for (const objectId of spec.objectIds) {
        const state = scope.indicatorState.get(objectId)
        if (!isPlotRenderState(state)) continue
        for (const plot of state.plots) {
          if (!plot.visible || !isAxisValuePlot(plot)) continue
          const point = lastPoint(plot)
          if (point === null) continue
          labels.push({
            kind: 'value',
            axisId: spec.axisId,
            role: 'tag',
            value: point.value,
            format: plot.format,
            background: point.color,
          })
        }
        for (const guide of state.guides)
          labels.push({
            kind: 'value',
            axisId: spec.axisId,
            role: 'tag',
            value: guide.value,
            background: guide.color,
          })
      }
    }
    return labels
  },
}
