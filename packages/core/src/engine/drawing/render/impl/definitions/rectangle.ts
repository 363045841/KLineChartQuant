/** 手绘矩形与脚本 Box 的公共定义：四角锚点直接围成填充与边框，水平延伸只作用于上下边。 */

import { anchorExtent } from '@/engine/drawing/geometry/impl/drawingExtent.js'
import { resolveRectLabelLayout } from '@/engine/drawing/geometry/impl/labelLayout.js'
import { rectangleGeometry } from '@/engine/drawing/geometry/impl/rectangleGeometry.js'
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
      const { points, edges } = rectangleGeometry(
        [topLeft, topRight, bottomRight, bottomLeft],
        drawing.extend,
        context.viewport.scrollLeft,
        context.viewport.scrollLeft + context.viewport.plotWidth,
      )

      const primitives: DrawingPrimitive[] = [
        {
          kind: 'area',
          labelTarget: 'inside',
          closed: true,
          points,
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
          primitives.push({ kind: 'line', ...edge, style: drawing.style })
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
