/**
 * 矩形图形定义：两个锚点分别代表矩形的对角点。
 */

import type { DrawingDefinition } from '@/engine/drawing/types.js'
import { rectFromPoints } from '@/foundation/geometry/index.js'

/** 创建矩形图形：两个锚点分别代表矩形的对角点。 */
export function createRectangleDefinition(): DrawingDefinition {
  return {
    kind: 'rectangle',
    minAnchors: 2,
    maxAnchors: 2,
    compute(drawing, context) {
      const [first, second] = drawing.anchors
      if (!first || !second) return { primitives: [] }
      const a = context.toScreen(first)
      const b = context.toScreen(second)
      const { left, top, right, bottom } = rectFromPoints(a, b)
      const topLeft = { x: left, y: top }
      const topRight = { x: right, y: top }
      const bottomRight = { x: right, y: bottom }
      const bottomLeft = { x: left, y: bottom }
      return {
        primitives: [
          {
            kind: 'area',
            points: [topLeft, topRight, bottomRight, bottomLeft],
            closed: true,
            style: { ...drawing.style, fillOpacity: drawing.style.fillOpacity ?? 0.1 },
          },
          { kind: 'line', a: topLeft, b: topRight, style: drawing.style },
          { kind: 'line', a: topRight, b: bottomRight, style: drawing.style },
          { kind: 'line', a: bottomRight, b: bottomLeft, style: drawing.style },
          { kind: 'line', a: bottomLeft, b: topLeft, style: drawing.style },
        ],
      }
    },
  }
}
