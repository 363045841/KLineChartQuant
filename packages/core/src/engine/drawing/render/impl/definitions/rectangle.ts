/**
 * 矩形图形定义：两个锚点分别代表矩形的对角点。
 */

import { rectangleGeometry } from '@/engine/drawing/geometry/impl/rectangleGeometry.js'
import type { DrawingDefinition } from '@/engine/drawing/types.js'
import { DEFAULT_DRAWING_FILL_OPACITY } from '@/foundation/tokens/index.js'
import { defineTwoAnchorDrawing } from './twoAnchor.js'

/** 创建矩形图形：两个锚点分别代表矩形的对角点。 */
export function createRectangleDefinition(): DrawingDefinition {
  return defineTwoAnchorDrawing('rectangle', (drawing, a, b) => {
    const { topLeft, topRight, bottomRight, bottomLeft, edges } = rectangleGeometry(a, b)
    return {
      primitives: [
        {
          kind: 'area',
          points: [topLeft, topRight, bottomRight, bottomLeft],
          closed: true,
          style: {
            ...drawing.style,
            fillOpacity: drawing.style.fillOpacity ?? DEFAULT_DRAWING_FILL_OPACITY,
          },
        },
        ...edges.map((edge) => ({
          kind: 'line' as const,
          a: edge.a,
          b: edge.b,
          style: drawing.style,
        })),
      ],
    }
  })
}
