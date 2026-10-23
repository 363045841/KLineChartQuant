/** 价格标签定义：对象文字直接投影为公共 Text 图元。 */
import type { DrawingDefinition } from '@/engine/drawing/types.js'

/** 单锚点纯文字标签，与其它绘图对象共用坐标投影。 */
export function createLabelDefinition(): DrawingDefinition {
  return {
    kind: 'label', minAnchors: 1, maxAnchors: 1,
    compute(drawing, context) {
      const anchor = drawing.anchors[0]
      const text = drawing.text
      if (!anchor || !text || text.value === '') return { primitives: [] }
      return { primitives: [{ kind: 'text', point: context.toScreen(anchor), text: text.value, align: text.align, baseline: text.verticalAlign,
        style: { ...drawing.style, textColor: text.color, fontSize: text.size },
      }] }
    },
  }
}
