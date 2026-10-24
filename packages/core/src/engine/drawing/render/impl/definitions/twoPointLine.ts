/**
 * 两点线段图形定义：两个锚点确定一条可配置延长语义的直线。
 */

import { anchorExtent } from '@/engine/drawing/geometry/impl/drawingExtent.js'
import type { DrawingDefinition, DrawingKind } from '@/engine/drawing/types.js'
import type { LinePrimitive } from '@/foundation/plugin/index.js'
import { defineTwoAnchorDrawing } from './twoAnchor.js'

/** 创建两点线段定义；extend 决定线段向两端延长的语义。 */
export function createTwoPointLineDefinition(
  kind: DrawingKind,
  extend: LinePrimitive['extend'],
): DrawingDefinition {
  return defineTwoAnchorDrawing(
    kind,
    (drawing, a, b) => {
      if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return { primitives: [] }
      if (a.x === b.x && a.y === b.y) return { primitives: [] }
      return {
        primitives: [
          {
            kind: 'line',
            a,
            b,
            extend: drawing.extend ?? extend,
            style: drawing.style,
          },
        ],
      }
    },
    (drawing) => anchorExtent(drawing.anchors, drawing.extend ?? extend),
  )
}
