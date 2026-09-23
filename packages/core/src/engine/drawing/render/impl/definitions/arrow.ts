/**
 * 箭头图形定义：第二个锚点是箭头尖端。
 */

import type { DrawingDefinition } from '../../../types.js'

/** 创建箭头图形：第二个锚点是箭头尖端。 */
export function createArrowDefinition(): DrawingDefinition {
  return {
    kind: 'arrow',
    minAnchors: 2,
    maxAnchors: 2,
    compute(drawing, context) {
      const [first, second] = drawing.anchors
      if (!first || !second) return { primitives: [] }
      const a = context.toScreen(first)
      const b = context.toScreen(second)
      return {
        primitives: [{ kind: 'arrow', start: a, end: b, style: drawing.style }],
      }
    },
  }
}
