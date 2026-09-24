/**
 * 信息线图形定义：两个锚点间绘制线段并附带涨跌/斜率文本。
 */

import { LINE_LABEL_BASELINE } from '@/engine/drawing/geometry/impl/labelLayout.js'
import type { DrawingDefinition } from '@/engine/drawing/types.js'

/** 格式化带符号数值，正数显式加 `+`；非有限值回退为 0。 */
function formatSigned(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '0'
  const fixed = value.toFixed(digits)
  return value > 0 ? `+${fixed}` : fixed
}

/** 创建信息线定义：线段标签承载涨跌额、百分比、bar 数与角度。 */
export function createInfoLineDefinition(): DrawingDefinition {
  return {
    kind: 'info-line',
    minAnchors: 2,
    maxAnchors: 2,
    compute(drawing, context) {
      const [first, second] = drawing.anchors
      if (!first || !second) return { primitives: [] }
      const a = context.toScreen(first)
      const b = context.toScreen(second)
      const firstIndex = Math.round(first.index)
      const secondIndex = Math.round(second.index)
      const bars = secondIndex - firstIndex
      const delta = second.price - first.price
      const percent = first.price !== 0 ? (delta / first.price) * 100 : 0
      const angle = Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI)
      const text = `${formatSigned(delta)} (${formatSigned(percent)}%)  ${bars} bars  ${formatSigned(angle)}°`

      return {
        primitives: [
          {
            kind: 'line',
            a,
            b,
            text: { text, baseline: LINE_LABEL_BASELINE },
            style: drawing.style,
          },
        ],
        meta: { delta, percent, bars, angle },
      }
    },
  }
}
