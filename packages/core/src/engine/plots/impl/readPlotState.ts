/** 通过绘图模型的判别字段读取 Plot 状态，不把领域输出强制转换为 Plot。 */
import type { PlotCollection, PlotRenderState } from '../types.js'

/** 识别计算器直接输出的共享 Plot 集合。 */
export function isPlotCollection(value: unknown): value is PlotCollection {
  return (
    value !== null &&
    typeof value === 'object' &&
    'plots' in value &&
    Array.isArray(value.plots) &&
    'fills' in value &&
    Array.isArray(value.fills)
  )
}

export function isPlotRenderState(value: unknown): value is PlotRenderState {
  return (
    value !== null &&
    typeof value === 'object' &&
    'kind' in value &&
    value.kind === 'plots' &&
    'plots' in value &&
    Array.isArray(value.plots) &&
    'fills' in value &&
    Array.isArray(value.fills)
  )
}
