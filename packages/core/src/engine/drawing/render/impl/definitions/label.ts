/** 价格标签定义：对象文字直接投影为公共 Text 图元。 */

import { UNBOUNDED_DRAWING_EXTENT } from '@/engine/drawing/geometry/impl/drawingExtent.js'
import { resolvePointLabelLayout } from '@/engine/drawing/geometry/impl/labelLayout.js'
import type { DrawingDefinition } from '@/engine/drawing/types.js'

/** 单锚点纯文字标签，与其它绘图对象共用坐标投影。 */
export function createLabelDefinition(): DrawingDefinition {
  return {
    kind: 'label',
    minAnchors: 1,
    maxAnchors: 1,
    extent(drawing) {
      const [anchor] = drawing.anchors
      if (!anchor || !Number.isFinite(anchor.index)) return UNBOUNDED_DRAWING_EXTENT
      return { start: anchor.index, end: anchor.index }
    },
    compute(drawing, context) {
      const anchor = drawing.anchors[0]
      const text = drawing.text
      if (!anchor || !text || text.value === '') return { primitives: [] }
      const layout = resolvePointLabelLayout(context.toScreen(anchor), text)
      return {
        primitives: [
          {
            kind: 'text',
            point: layout.point,
            text: text.value,
            align: layout.align,
            baseline: layout.baseline,
            style: drawing.style,
          },
        ],
      }
    },
  }
}
