/** 按时间身份投影指标输出，不修改计算结果，也不猜测数组中的领域坐标。 */
import { isOhlcPlot, type DrawingObject, type Plot, type PlotCollection } from '@363045841yyt/klinechart-plot-contracts'
import type { IndicatorTimelineProjection } from '../types.js'

/** 未指定展示映射的独立调用保留原始坐标。 */
export function identityIndicatorIndex(index: number): number { return index }

/** 全局冻结恒等单例：复用恒等投影，避免重复分配。 */
const IDENTITY_PROJECTION: IndicatorTimelineProjection = Object.freeze({
  identity: true,
  projectIndex: (index: number): number => (Number.isFinite(index) ? index : Number.NaN),
  projectArray: <T>(values: readonly T[]): readonly (T | undefined)[] => values,
})

/** 用计算快照和展示快照建立双向索引；分时展示沿用同分钟对齐规则。 */
export function createIndicatorTimelineProjection(
  source: readonly number[],
  target: readonly number[],
  byMinute: boolean,
): IndicatorTimelineProjection {
  const identity = source.length === target.length && source.every((time, index) => time === target[index])
  if (identity) return IDENTITY_PROJECTION
  /** K 线精确匹配时间戳；分时才按分钟聚合。 */
  const key = (time: number): number => byMinute ? Math.floor(time / 60_000) : time
  const sourceByTime = new Map(source.map((time, index) => [key(time), index]))
  const targetByTime = new Map(target.map((time, index) => [key(time), index]))
  const sourceIndices = target.map((time) => sourceByTime.get(key(time)))
  const targetIndices = source.map((time) => targetByTime.get(key(time)))
  /** 只在计算范围外保持相对边界的槽位距离；范围内缺失的 bar 不伪造位置。 */
  function projectIndex(index: number): number {
    if (!Number.isFinite(index)) return Number.NaN
    if (source.length === 0) return Number.NaN
    if (index < 0) {
      const first = targetIndices[0]
      return first === undefined ? Number.NaN : first + index
    }
    const lastIndex = source.length - 1
    if (index > lastIndex) {
      const last = targetIndices[lastIndex]
      return last === undefined ? Number.NaN : last + index - lastIndex
    }
    const lower = Math.floor(index)
    const left = targetIndices[lower]
    if (left === undefined) return Number.NaN
    if (lower === index) return left
    const right = targetIndices[lower + 1]
    return right === undefined ? Number.NaN : left + (right - left) * (index - lower)
  }
  return {
    identity,
    projectIndex,
    /** 保留样式、标签、锚点等非序列数组，仅调用方明确声明的数据列参与重排。 */
    projectArray<T>(values: readonly T[]): readonly (T | undefined)[] {
      return sourceIndices.map((index) => index === undefined ? undefined : values[index])
    },
  }
}

/** 只投影索引锚点，bar_time 已有绝对身份，不随行情数组变化。 */
function projectDrawing(drawing: DrawingObject, timeline: IndicatorTimelineProjection): DrawingObject {
  return { ...drawing, anchors: drawing.anchors.map((anchor) => anchor.logicalIndex === undefined
    ? anchor
    : { ...anchor, logicalIndex: timeline.projectIndex(anchor.logicalIndex) }) }
}

/** Plot、逐 bar 填充与 drawing 共用时间轴映射，绘图偏移仍是独立的用户语义。 */
export function projectIndicatorCollection(
  collection: PlotCollection,
  timeline: IndicatorTimelineProjection,
): PlotCollection {
  if (timeline.identity) return collection
  const plots = collection.plots.map((plot): Plot => isOhlcPlot(plot)
    ? { ...plot, data: timeline.projectArray(plot.data) }
    : { ...plot, data: timeline.projectArray(plot.data) })
  return {
    plots,
    fills: collection.fills.map((fill) => ({ ...fill, colors: timeline.projectArray(fill.colors).map((color) => color === undefined ? null : color) })),
    drawings: collection.drawings?.map((drawing) => projectDrawing(drawing, timeline)),
  }
}
