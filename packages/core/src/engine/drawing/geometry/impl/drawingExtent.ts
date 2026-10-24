/**
 * 图元水平可见范围：帧投影在计算几何前据此裁掉视口外图元。
 *
 * 只判断横向是否可能进入视口，纵向由价格轴与 canvas 裁剪负责。
 * 无界的一侧用 null 表示，避免把跨视口的长线与延伸图形误裁。
 */
import type { LineExtend } from '@363045841yyt/klinechart-plot-contracts'
import type { DrawingHorizontalExtent, ResolvedDrawingAnchor } from '../../types.js'

/** 视口两侧各多留一根 K 线：锚点外侧的文字与线帽仍可能溢入视口。 */
export const DRAWING_RANGE_MARGIN = 1

/** 整条索引轴可见；水平线、十字线以及无法定位锚点的图元使用该范围。 */
export const UNBOUNDED_DRAWING_EXTENT: DrawingHorizontalExtent = Object.freeze({
  start: null,
  end: null,
})

/**
 * 由锚点求水平范围。
 * @param anchors 已解析逻辑索引的锚点
 * @param extend 延长语义；声明无界的一侧取 null
 * @returns 锚点包围盒；锚点索引无效时按整轴可见处理
 */
export function anchorExtent(
  anchors: readonly ResolvedDrawingAnchor[],
  extend: LineExtend = 'none',
): DrawingHorizontalExtent {
  let first = Infinity
  let last = -Infinity
  for (const anchor of anchors) {
    if (!Number.isFinite(anchor.index)) return UNBOUNDED_DRAWING_EXTENT
    first = Math.min(first, anchor.index)
    last = Math.max(last, anchor.index)
  }
  if (first > last) return UNBOUNDED_DRAWING_EXTENT
  return {
    start: extend === 'left' || extend === 'both' ? null : first,
    end: extend === 'right' || extend === 'both' ? null : last,
  }
}

/**
 * 水平范围是否与可见索引区间相交。
 * @param extent 图元水平范围
 * @param range 可见区间，end 为开区间
 * @param margin 两侧余量，单位是 K 线根数
 * @returns 相交或任一侧无界时为 true
 */
export function intersectsDrawingRange(
  extent: DrawingHorizontalExtent,
  range: { readonly start: number; readonly end: number },
  margin = DRAWING_RANGE_MARGIN,
): boolean {
  const first = range.start - margin
  const last = range.end - 1 + margin
  if (extent.end !== null && extent.end < first) return false
  if (extent.start !== null && extent.start > last) return false
  return true
}
