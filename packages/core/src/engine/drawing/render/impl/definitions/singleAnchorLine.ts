/**
 * 单锚点线图形定义：水平线 / 水平射线 / 垂直线 / 十字线。
 */

import { UNBOUNDED_DRAWING_EXTENT } from '@/engine/drawing/geometry/impl/drawingExtent.js'
import type { DrawingDefinition, DrawingKind } from '@/engine/drawing/types.js'
import { POINT_ROLE, PRIMITIVE_KIND } from '@/foundation/plugin/index.js'

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
        const y = context.pane.yAxis.priceToY(anchor.price)
        return {
          primitives: [
            {
              kind: 'line',
              a: { x: 0, y },
              b: { x: right, y },
              showEndpoints: false,
              style: drawing.style,
            },
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
