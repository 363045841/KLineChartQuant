/**
 * 箭头图形定义：第二个锚点是箭头尖端。
 */

import type { DrawingDefinition } from '@/engine/drawing/types.js'
import { defineTwoAnchorDrawing } from './twoAnchor.js'

/** 创建箭头图形：第二个锚点是箭头尖端。 */
export function createArrowDefinition(): DrawingDefinition {
  return defineTwoAnchorDrawing('arrow', (drawing, a, b) => ({
    primitives: [{ kind: 'arrow', start: a, end: b, style: drawing.style }],
  }))
}
