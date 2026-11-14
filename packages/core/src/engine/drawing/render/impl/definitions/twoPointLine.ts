/**
 * 两点线段图形定义：两个锚点确定一条可配置延长语义的直线。
 */

import { anchorExtent } from '@/engine/drawing/geometry/impl/drawingExtent.js'
import { drawingKindExtend } from '@/engine/drawing/model/impl/drawingKindSpecs.js'
import type { DrawingDefinition, DrawingKind } from '@/engine/drawing/types.js'
import { defineTwoAnchorDrawing } from './twoAnchor.js'

/** 创建两点线段定义；延伸语义由种类声明给出，实例可覆盖。 */
export function createTwoPointLineDefinition(kind: DrawingKind): DrawingDefinition {
  const extend = drawingKindExtend(kind)
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
