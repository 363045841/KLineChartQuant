/** 手绘矩形与脚本 Box 的公共定义：四角锚点直接围成填充与边框，水平延伸只作用于上下边。 */

import { anchorExtent } from '@/engine/drawing/geometry/impl/drawingExtent.js'
import { resolveRectLabelLayout } from '@/engine/drawing/geometry/impl/labelLayout.js'
import type { DrawingDefinition } from '@/engine/drawing/types.js'
import type { DrawingPrimitive } from '@/foundation/plugin/types.js'
import { DEFAULT_DRAWING_FILL_OPACITY } from '@/foundation/tokens/index.js'

/** 四角顺时针定义矩形；水平延伸保持上下边与填充一致，竖边只在真实左右边界绘制。 */
export function createRectangleDefinition(): DrawingDefinition {
  return {
    kind: 'rectangle',
    extent: (drawing) => anchorExtent(drawing.anchors, drawing.extend),
    compute(drawing, context) {
      const [topLeftAnchor, topRightAnchor, bottomRightAnchor, bottomLeftAnchor] = drawing.anchors
      if (!topLeftAnchor || !topRightAnchor || !bottomRightAnchor || !bottomLeftAnchor)
        return { primitives: [] }

      const topLeft = context.toScreen(topLeftAnchor)
      const topRight = context.toScreen(topRightAnchor)
      const bottomRight = context.toScreen(bottomRightAnchor)
      const bottomLeft = context.toScreen(bottomLeftAnchor)
      const extendLeft = drawing.extend === 'left' || drawing.extend === 'both'
      const extendRight = drawing.extend === 'right' || drawing.extend === 'both'
      const left = extendLeft ? Math.min(topLeft.x, context.viewport.scrollLeft) : topLeft.x
      const right = extendRight
        ? Math.max(topRight.x, context.viewport.scrollLeft + context.viewport.plotWidth)
        : topRight.x

      const primitives: DrawingPrimitive[] = [
        {
          kind: 'area',
          closed: true,
          points: [
            { x: left, y: topLeft.y },
            { x: right, y: topRight.y },
            { x: right, y: bottomRight.y },
            { x: left, y: bottomLeft.y },
          ],
          style: {
            ...drawing.style,
            fillOpacity:
              drawing.style.fillOpacity === undefined
                ? DEFAULT_DRAWING_FILL_OPACITY
                : drawing.style.fillOpacity,
          },
        },
      ]
      if (drawing.style.strokeWidth !== 0) {
        // 顺时针四条边：上、右、下、左；延伸侧不封口，避免与延长后的上下边重叠。
        const edges = [
          { a: { x: left, y: topLeft.y }, b: { x: right, y: topRight.y } },
          { a: topRight, b: bottomRight },
          { a: { x: right, y: bottomRight.y }, b: { x: left, y: bottomLeft.y } },
          { a: bottomLeft, b: topLeft },
        ]
        for (const [index, edge] of edges.entries()) {
          if ((index === 1 && extendRight) || (index === 3 && extendLeft)) continue
          primitives.push({ kind: 'line', a: edge.a, b: edge.b, style: drawing.style })
        }
      }
      const text = drawing.text
      if (text && text.value !== '') {
        const layout = resolveRectLabelLayout(topLeft, topRight, bottomLeft, text)
        primitives.push({
          kind: 'text',
          point: layout.point,
          text: text.value,
          align: layout.align,
          baseline: layout.baseline,
          style: drawing.style,
        })
      }
      return { primitives }
    },
  }
}
