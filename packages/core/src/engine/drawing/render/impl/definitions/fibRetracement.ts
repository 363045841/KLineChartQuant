/**
 * 斐波那契回撤图形定义：两个锚点定义区间，水平线覆盖区间的时间范围。
 */

import { fibLevelLines } from '@/engine/drawing/geometry/impl/fibLevels.js'
import type { DrawingDefinition } from '@/engine/drawing/types.js'
import { defineTwoAnchorDrawing } from './twoAnchor.js'

/** 创建斐波那契回撤图形：两个锚点定义区间，水平线覆盖区间的时间范围。 */
export function createFibRetracementDefinition(): DrawingDefinition {
  return defineTwoAnchorDrawing('fib-retracement', (drawing, a, b) => ({
    primitives: fibLevelLines(drawing.params, a, b).flatMap((level) => [
      {
        kind: 'line' as const,
        a: { x: level.left, y: level.y },
        b: { x: level.right, y: level.y },
        style: drawing.style,
      },
      {
        kind: 'text' as const,
        point: { x: level.right + 4, y: level.y },
        text: `${(level.ratio * 100).toFixed(1)}%`,
        baseline: 'middle' as const,
        style: drawing.style,
      },
    ]),
  }))
}
