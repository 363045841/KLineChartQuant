/**
 * 两锚点图形定义的公共骨架：统一锚点数量、缺失检查和屏幕投影。
 *
 * 各图形只描述自己的 primitive，不再重复解析 anchors[0..1]。
 */

import { anchorExtent } from '@/engine/drawing/geometry/impl/drawingExtent.js'
import type {
  DrawingComputeContext,
  DrawingDefinition,
  DrawingGeometry,
  DrawingHorizontalExtent,
  DrawingKind,
  ResolvedDrawingAnchor,
  ResolvedDrawingObject,
} from '@/engine/drawing/types.js'
import type { Point } from '@/foundation/geometry/types.js'

/** 两锚点图形的计算函数；a/b 已投影到屏幕坐标，anchors 保留原始价格与索引。 */
type TwoAnchorCompute<TParams> = (
  drawing: ResolvedDrawingObject<TParams>,
  a: Point,
  b: Point,
  anchors: readonly [ResolvedDrawingAnchor, ResolvedDrawingAnchor],
) => DrawingGeometry

/** 两锚点图形的水平范围；缺省按锚点包围盒，延长语义由调用方声明。 */
type TwoAnchorExtent<TParams> = (drawing: ResolvedDrawingObject<TParams>) => DrawingHorizontalExtent

/**
 * 创建只接受两个锚点的图形定义。
 * @param kind 图元种类
 * @param compute 接收已投影坐标的几何计算函数
 * @param extent 水平可见范围；缺省为两锚点包围盒
 * @returns 锚点数量、可见范围与投影规则统一的图形定义
 */
export function defineTwoAnchorDrawing<TParams = Record<string, unknown>>(
  kind: DrawingKind,
  compute: TwoAnchorCompute<TParams>,
  extent: TwoAnchorExtent<TParams> = (drawing) => anchorExtent(drawing.anchors),
): DrawingDefinition<TParams> {
  return {
    kind,
    minAnchors: 2,
    maxAnchors: 2,
    extent,
    compute(drawing, context: DrawingComputeContext) {
      const [first, second] = drawing.anchors
      if (!first || !second) return { primitives: [] }
      return compute(drawing, context.toScreen(first), context.toScreen(second), [first, second])
    },
  }
}
