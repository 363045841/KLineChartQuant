// 根据最终标签的字符组成估算轴宽，不依赖 DOM 或 Canvas 文本测量。
import { AXIS_LABEL_KIND, type AxisLabel } from '../../../foundation/plugin/types.js'
import type { AxisWidthFrame, AxisWidths } from '../types.js'

const DEFAULT_FONT_SIZE = 12
const AXIS_PADDING = 12
const DIGIT_WIDTH = 0.64
const NARROW_WIDTH = 0.36
const LATIN_WIDTH = 0.75
const WIDE_WIDTH = 1
const BOLD_FACTOR = 1.06

/** 以字号为基准估算字符宽度；全角字符按一字宽预留。 */
export function estimateAxisTextWidth(text: string, fontSize = DEFAULT_FONT_SIZE): number {
  let units = 0
  for (const char of text) {
    if (/[0-9]/u.test(char)) units += DIGIT_WIDTH
    else if (/[.,:;'\s]/u.test(char)) units += NARROW_WIDTH
    else if ((char.codePointAt(0) ?? 0) > 0xff) units += WIDE_WIDTH
    else units += LATIN_WIDTH
  }
  return units * fontSize
}

/** 标签文本和倒计时共用一列，按较宽一行估算。 */
function estimateLabelWidth(label: AxisLabel): number {
  const fontSize = label.fontSize ?? DEFAULT_FONT_SIZE
  const bold = label.kind === AXIS_LABEL_KIND.TICK && label.bold ? BOLD_FACTOR : 1
  const textWidth = estimateAxisTextWidth(label.text, fontSize) * bold
  const countdownWidth =
    label.kind === AXIS_LABEL_KIND.TAG && label.countdown
      ? estimateAxisTextWidth(label.countdown, fontSize)
      : 0
  return Math.ceil(Math.max(textWidth, countdownWidth) + AXIS_PADDING)
}

/** 保留未重绘表面的宽度；Pane 删除时清除记录，每侧取所有可见 Pane 的最大值。 */
export class AxisWidthEstimator {
  private readonly widths = new Map<string, { static: AxisWidths; overlay: AxisWidths }>()

  /** 输入本帧最终标签，返回左右两侧所需宽度。 */
  estimate(frame: AxisWidthFrame): AxisWidths {
    const visible = new Set(frame.paneIds)
    for (const id of this.widths.keys()) {
      if (!visible.has(id)) this.widths.delete(id)
    }
    const result: AxisWidths = { left: 0, right: 0 }
    for (const id of frame.paneIds) {
      const widths = this.widths.get(id) ?? {
        static: { left: 0, right: 0 },
        overlay: { left: 0, right: 0 },
      }
      for (const part of ['static', 'overlay'] as const) {
        if (part === 'static' ? frame.updateStatic : frame.updateOverlay) {
          const left = part === 'static' ? 'yLeftStatic' : 'yLeftOverlay'
          const right = part === 'static' ? 'yRightStatic' : 'yRightOverlay'
          widths[part] = {
            left: Math.max(0, ...frame.labels.forSurface(left, id).labels.map(estimateLabelWidth)),
            right: Math.max(
              0,
              ...frame.labels.forSurface(right, id).labels.map(estimateLabelWidth),
            ),
          }
        }
        result.left = Math.max(result.left, widths[part].left)
        result.right = Math.max(result.right, widths[part].right)
      }
      this.widths.set(id, widths)
    }
    return result
  }
}
