/**
 * 两锚点图形定义的公共骨架：统一锚点数量、缺失检查和屏幕投影。
 *
 * 各图形只描述自己的 primitive，不再重复解析 anchors[0..1]。
 */

import type {
  DrawingComputeContext,
  DrawingDefinition,
  DrawingGeometry,
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

/**
 * 创建只接受两个锚点的图形定义。
 * @param kind 图元种类
 * @param compute 接收已投影坐标的几何计算函数
 * @returns 锚点数量与投影规则统一的图形定义
 */
export function defineTwoAnchorDrawing<TParams = Record<string, unknown>>(
  kind: DrawingKind,
  compute: TwoAnchorCompute<TParams>,
): DrawingDefinition<TParams> {
  return {
    kind,
    minAnchors: 2,
    maxAnchors: 2,
    compute(drawing, context: DrawingComputeContext) {
      const [first, second] = drawing.anchors
      if (!first || !second) return { primitives: [] }
      return compute(drawing, context.toScreen(first), context.toScreen(second), [first, second])
    },
  }
}
