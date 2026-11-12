/**
 * 单锚点线图形定义：水平线 / 水平射线 / 垂直线 / 十字线。
 */

import { UNBOUNDED_DRAWING_EXTENT } from '@/engine/drawing/geometry/impl/drawingExtent.js'
import { placeAnchorHandle } from '@/engine/drawing/handles/impl/placement.js'
import type {
  DrawingComputeContext,
  DrawingDefinition,
  DrawingKind,
} from '@/engine/drawing/types.js'
import {
  type DrawingPrimitive,
  type DrawingStyle,
  POINT_ROLE,
  PRIMITIVE_KIND,
  type ScreenDrawingAnchor,
} from '@/foundation/plugin/index.js'

/**
 * 单锚点线的锚点手柄：落位由手柄布局统一给出，保证绘制、命中、拖动同一处推导。
 * 水平线在右侧留内边距、垂直线在下方留内边距；拖动平移的是整条线，
 * 因此用平移手柄角色（方块），与通道中点手柄同一形状语义。
 * @param kind 图元种类
 * @param projection 锚点的单轴投影
 * @param context 当前帧的几何上下文
 * @param style 图元样式（跟随即时描边）
 * @returns 锚点手柄图元；该锚点不出手柄时为空数组
 */
function anchorHandlePrimitives(
  kind: DrawingKind,
  projection: ScreenDrawingAnchor,
  context: DrawingComputeContext,
  style: DrawingStyle,
): DrawingPrimitive[] {
  const placed = placeAnchorHandle(kind, projection, {
    plotWidth: context.viewport.plotWidth,
    paneHeight: context.pane.height,
  })
  if (!placed) return []
  return [
    {
      kind: PRIMITIVE_KIND.point,
      role: POINT_ROLE['translate-handle'],
      point: placed.point,
      style,
    },
  ]
}

/** 创建单锚点线定义：按 kind 输出水平线、射线、垂直线或十字线。 */
export function createSingleAnchorLineDefinition(kind: DrawingKind): DrawingDefinition {
  return {
    kind,
    minAnchors: 1,
    maxAnchors: 1,
    extent(drawing) {
      // 水平线与十字线横跨整条索引轴；水平射线向右无界；垂直线只占一个槽位。
      if (kind === 'horizontal-line' || kind === 'cross-line') return UNBOUNDED_DRAWING_EXTENT
      const [anchor] = drawing.anchors
      if (!anchor || !Number.isFinite(anchor.index)) return UNBOUNDED_DRAWING_EXTENT
      if (kind === 'horizontal-ray') return { start: anchor.index, end: null }
      return { start: anchor.index, end: anchor.index }
    },
    compute(drawing, context) {
      const [anchor] = drawing.anchors
      if (!anchor) return { primitives: [] }
      const bottom = context.pane.height
      const right = context.viewport.plotWidth

      if (kind === 'horizontal-line') {
        if (anchor.type === 'vertical') return { primitives: [] }
        const y = context.toScreen(anchor).y
        return {
          primitives: [
            {
              kind: 'line',
              a: { x: 0, y },
              b: { x: right, y },
              showEndpoints: false,
              style: drawing.style,
            },
            ...anchorHandlePrimitives(kind, { type: 'horizontal', y }, context, drawing.style),
          ],
        }
      }

      const point = context.toScreen(anchor)

      if (kind === 'horizontal-ray') {
        return {
          primitives: [
            {
              kind: 'line',
              a: point,
              b: { x: right, y: point.y },
              showEndpoints: false,
              style: drawing.style,
            },
            { kind: PRIMITIVE_KIND.point, role: POINT_ROLE.anchor, point, style: drawing.style },
          ],
        }
      }

      if (kind === 'vertical-line') {
        if (anchor.type === 'horizontal') return { primitives: [] }
        return {
          primitives: [
            {
              kind: 'line',
              a: { x: point.x, y: 0 },
              b: { x: point.x, y: bottom },
              showEndpoints: false,
              style: drawing.style,
            },
            ...anchorHandlePrimitives(
              kind,
              { type: 'vertical', x: point.x },
              context,
              drawing.style,
            ),
          ],
        }
      }

      // cross-line: 十字线，显示水平和垂直线，锚点显示一个点，边缘不显示端点
      return {
        primitives: [
          {
            kind: 'line',
            a: { x: 0, y: point.y },
            b: { x: right, y: point.y },
            showEndpoints: false,
            style: drawing.style,
          },
          {
            kind: 'line',
            a: { x: point.x, y: 0 },
            b: { x: point.x, y: bottom },
            showEndpoints: false,
            style: drawing.style,
          },
          { kind: PRIMITIVE_KIND.point, role: POINT_ROLE.anchor, point, style: drawing.style },
        ],
      }
    },
  }
}
