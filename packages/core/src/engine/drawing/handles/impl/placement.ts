/**
 * 锚点手柄的落位声明：把锚点的屏幕投影补成一个可点击的手柄点。
 *
 * 默认规则是「手柄落在锚点自身的投影点上」；只有坐标不完整的图元
 * （水平线只有价格、垂直线只有时间）在这里声明补哪根轴、离边界多远。
 * 这类靠边手柄带 selectionOnly：位置不落在锚点自身，未选中态若仍参与命中，
 * 就会在看不见的地方留下可拖拽热点。
 */

import type { Point } from '@/foundation/geometry/types.js'
import type { ScreenDrawingAnchor } from '@/foundation/plugin/index.js'
import type { DrawingKind } from '../../types.js'
import type { DrawingHandleBounds } from '../types.js'

/** 靠边手柄与绘图区边界的内边距（Pane 内逻辑像素），保证手柄不贴轴。 */
const EDGE_HANDLE_INSET = 40

/** 落位结果：手柄屏幕点 + 是否只在选中态出现。 */
export interface PlacedAnchorHandle {
  /** 手柄屏幕位置（Pane 内逻辑像素）。 */
  readonly point: Point
  /** 为 true 时未选中态不产生该手柄。 */
  readonly selectionOnly: boolean
}

/** 落位算法：锚点投影 + Pane 边界 → 手柄落位。 */
type AnchorPlacement = (
  projection: ScreenDrawingAnchor,
  bounds: DrawingHandleBounds | null,
) => PlacedAnchorHandle | null

/** 默认落位：手柄落在锚点自身的投影点上，未选中也可命中。 */
const atProjectedPoint: AnchorPlacement = (projection) =>
  projection.type === 'point'
    ? { point: { x: projection.x, y: projection.y }, selectionOnly: false }
    : null

/** 到绘图区右 / 下边界的内缩位置；绘图区比内边距还小时贴边。 */
function insetFromEdge(extent: number): number {
  return Math.max(0, extent - EDGE_HANDLE_INSET)
}

/** 非默认落位的图元；未登记的图元使用 atProjectedPoint。 */
const ANCHOR_PLACEMENTS: Partial<Record<DrawingKind, AnchorPlacement>> = {
  // 水平线只有价格：手柄贴右边界内侧，拖动改价格。
  'horizontal-line': (projection, bounds) =>
    bounds !== null && projection.type === 'horizontal'
      ? { point: { x: insetFromEdge(bounds.plotWidth), y: projection.y }, selectionOnly: true }
      : null,
  // 垂直线只有时间：手柄贴底边界内侧，拖动改时间。
  'vertical-line': (projection, bounds) =>
    bounds !== null && projection.type === 'vertical'
      ? { point: { x: projection.x, y: insetFromEdge(bounds.paneHeight) }, selectionOnly: true }
      : null,
}

/**
 * 解析锚点手柄的落位。
 * @param kind 图元种类
 * @param projection 锚点的屏幕投影（单轴锚点保留单轴语义）
 * @param bounds Pane 边界；缺失时不产生靠边手柄
 * @returns 手柄落位；该锚点不出手柄时返回 null
 */
export function placeAnchorHandle(
  kind: DrawingKind,
  projection: ScreenDrawingAnchor,
  bounds: DrawingHandleBounds | null,
): PlacedAnchorHandle | null {
  return (ANCHOR_PLACEMENTS[kind] ?? atProjectedPoint)(projection, bounds)
}
