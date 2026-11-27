/** Plot 图例投影：从绘图数据直接读取当前点、标签和颜色。 */

import { isOhlcPlot, plotPointAt } from '@363045841yyt/klinechart-plot-contracts'
import type { GetTitleInfoFn } from '@/engine/renderers/Indicator/types.js'
import { formatPlotValue } from './plotValueFormat.js'
import { isPlotRenderState } from './readPlotState.js'

/**
 * 普通指标共用图例取值逻辑，不再读取各自的计算结果字段。
 * 点色与数值格式已在产出时物化，图例只读 `plot.data[index]`。
 */
export function createPlotTitleInfo(name: string): GetTitleInfoFn {
  return (_data, index, params, reader, instanceId) => {
    if (index === null) return null
    const state = reader.get(instanceId)
    if (!isPlotRenderState(state)) return null
    const values = state.plots
      .filter((plot) => plot.visible)
      .flatMap((plot) => {
        if (isOhlcPlot(plot)) {
          const point = plotPointAt(plot, index)
          if (!point) return []
          // OHLC 的实体、边框、影线是三个部件，取第一个可见部件作为图例色。
          const color = point.color ?? point.borderColor ?? point.wickColor
          if (color === null) return []
          return [
            { label: `${plot.label} O`, value: point.open, color },
            { label: `${plot.label} H`, value: point.high, color },
            { label: `${plot.label} L`, value: point.low, color },
            { label: `${plot.label} C`, value: point.close, color },
          ]
        }
        const point = plotPointAt(plot, index)
        if (!point || !Number.isFinite(point.value)) return []
        return [
          {
            label: plot.label,
            value: point.value,
            color: point.color,
            ...(plot.format === undefined
              ? {}
              : { formattedValue: formatPlotValue(plot.format, point.value) }),
          },
        ]
      })
    if (values.length === 0) return null
    return {
      name,
      params: Object.values(params).filter(
        (value) => typeof value === 'number' || typeof value === 'string',
      ),
      values,
    }
  }
}
