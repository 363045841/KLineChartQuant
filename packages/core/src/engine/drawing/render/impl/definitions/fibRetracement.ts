/**
 * 斐波那契回撤图形定义：两个锚点定义区间，水平线覆盖区间的时间范围。
 */

import type { DrawingDefinition } from '@/engine/drawing/types.js'
import { rectFromPoints } from '@/foundation/geometry/index.js'

/** 创建斐波那契回撤图形：两个锚点定义区间，水平线覆盖区间的时间范围。 */
export function createFibRetracementDefinition(): DrawingDefinition {
  const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
  return {
    kind: 'fib-retracement',
    minAnchors: 2,
    maxAnchors: 2,
    compute(drawing, context) {
      const [first, second] = drawing.anchors
      if (!first || !second) return { primitives: [] }
      const a = context.toScreen(first)
      const b = context.toScreen(second)
      const { left, right } = rectFromPoints(a, b)
      const configured = (drawing.params as { levels?: number[] } | undefined)?.levels
      const ratios = configured?.length ? configured : levels
      return {
        primitives: ratios.flatMap((ratio) => {
          const y = a.y + (b.y - a.y) * ratio
          return [
            { kind: 'line' as const, a: { x: left, y }, b: { x: right, y }, style: drawing.style },
            {
              kind: 'text' as const,
              point: { x: right + 4, y },
              text: `${(ratio * 100).toFixed(1)}%`,
              baseline: 'middle' as const,
              style: drawing.style,
            },
          ]
        }),
      }
    },
  }
}
