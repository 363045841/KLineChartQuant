/**
 * 两点线段图形定义：两个锚点确定一条可配置延长语义的直线。
 */

import type { DrawingDefinition, DrawingKind } from '@/engine/drawing/types.js'
import type { LinePrimitive } from '@/foundation/plugin/index.js'

/** 创建两点线段定义；extend 决定线段向两端延长的语义。 */
export function createTwoPointLineDefinition(
  kind: DrawingKind,
  extend: LinePrimitive['extend'],
): DrawingDefinition {
  return {
    kind,
    minAnchors: 2,
    maxAnchors: 2,
    compute(drawing, context) {
      const [first, second] = drawing.anchors
      if (!first || !second) return { primitives: [] }
      const a = context.toScreen(first)
      const b = context.toScreen(second)
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
  }
}
