/**
 * 两锚点图形定义的公共骨架：统一缺失检查与屏幕投影。
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
  PointDrawingAnchor,
  ResolvedDrawingAnchor,
  ResolvedDrawingObject,
} from '@/engine/drawing/types.js'
import type { Point } from '@/foundation/geometry/types.js'

/** 两锚点图形只接受点锚点；价格与索引都参与几何。 */
type ResolvedPointAnchor = PointDrawingAnchor & { readonly index: number }

/** 判断解析后的锚点是否为点锚点。 */
function isResolvedPointAnchor(anchor: ResolvedDrawingAnchor): anchor is ResolvedPointAnchor {
  return anchor.type === undefined || anchor.type === 'point'
}

/** 两锚点图形的计算函数；a/b 已投影到屏幕坐标，anchors 保留原始价格与索引。 */
type TwoAnchorCompute<TParams> = (
  drawing: ResolvedDrawingObject<TParams>,
  a: Point,
  b: Point,
  anchors: readonly [ResolvedPointAnchor, ResolvedPointAnchor],
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
    extent,
    compute(drawing, context: DrawingComputeContext) {
      const [first, second] = drawing.anchors
      if (!first || !second) return { primitives: [] }
      // 两锚点图形没有单轴锚点；出现说明数据与种类不一致，直接不绘制。
      if (!isResolvedPointAnchor(first) || !isResolvedPointAnchor(second))
        return { primitives: [] }
      return compute(drawing, context.toScreen(first), context.toScreen(second), [first, second])
    },
  }
}
