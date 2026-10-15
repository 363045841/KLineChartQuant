/** Plot 图例投影：从绘图数据直接读取当前点、标签和颜色。 */
import type { GetTitleInfoFn } from '@/engine/indicators/indicatorMetadata.js'
import { isPlotRenderState } from './readPlotState.js'

/** 普通指标共用图例取值逻辑，不再读取各自的计算结果字段。 */
export function createPlotTitleInfo(name: string): GetTitleInfoFn {
  return (_data, index, params, reader, instanceId) => {
    if (index === null) return null
    const state = reader.get(instanceId)
    if (!isPlotRenderState(state)) return null
    const values = state.plots
      .filter((plot) => plot.visible)
      .flatMap((plot) => {
        const point = plot.data[index - plot.offset]
        return point && Number.isFinite(point.value)
          ? [{ label: plot.label, value: point.value, color: point.color ?? plot.color }]
          : []
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
