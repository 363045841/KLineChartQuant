/** 手绘矩形与脚本 Box 的公共定义，填充与真实边界分别裁剪。 */

import { anchorExtent } from '@/engine/drawing/geometry/impl/drawingExtent.js'
import { rectangleGeometry } from '@/engine/drawing/geometry/impl/rectangleGeometry.js'
import type { DrawingDefinition } from '@/engine/drawing/types.js'
import type { DrawingPrimitive } from '@/foundation/plugin/types.js'
import { DEFAULT_DRAWING_FILL_OPACITY } from '@/foundation/tokens/index.js'

/** 两个对角点确定价格范围，水平延伸保持上下边界和填充一致。 */
export function createRectangleDefinition(): DrawingDefinition {
  return {
    kind: 'rectangle',
    minAnchors: 2,
    maxAnchors: 2,
    extent: (drawing) => anchorExtent(drawing.anchors, drawing.extend),
    compute(drawing, context) {
      const [first, second] = drawing.anchors
      if (!first || !second) return { primitives: [] }
      const a = context.toScreen(first)
      const b = context.toScreen(second)
      const { topLeft, topRight, bottomRight, bottomLeft, edges } = rectangleGeometry(a, b)
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
        for (const edge of edges) {
          const horizontal = edge.a.y === edge.b.y
          // 只在真实左右边界绘制竖边，延伸边没有人为封口。
          if (
            !horizontal &&
            ((extendLeft && edge.a.x === topLeft.x) || (extendRight && edge.a.x === topRight.x))
          )
            continue
          primitives.push({
            kind: 'line',
            a: horizontal ? { x: left, y: edge.a.y } : edge.a,
            b: horizontal ? { x: right, y: edge.b.y } : edge.b,
            style: drawing.style,
          })
        }
      }
      const text = drawing.text
      if (text && text.value !== '') {
        primitives.push({
          kind: 'text',
          point: {
            x:
              text.align === 'left'
                ? topLeft.x
                : text.align === 'right'
                  ? topRight.x
                  : (topLeft.x + topRight.x) / 2,
            y:
              text.verticalAlign === 'top'
                ? topLeft.y
                : text.verticalAlign === 'bottom'
                  ? bottomLeft.y
                  : (topLeft.y + bottomLeft.y) / 2,
          },
          text: text.value,
          align: text.align,
          baseline: text.verticalAlign,
          style: { ...drawing.style, textColor: text.color, fontSize: text.size },
        })
      }
      return { primitives }
    },
  }
}
