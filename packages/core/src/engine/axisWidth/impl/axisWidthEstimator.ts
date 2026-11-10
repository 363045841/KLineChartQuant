// 根据最终标签的字符组成估算轴宽，不依赖 DOM 或 Canvas 文本测量。
import { AXIS_LABEL_KIND, type AxisLabel } from '../../../foundation/plugin/types.js'
import type { AxisColumnLayout, AxisWidthFrame, AxisWidths } from '../types.js'

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

/**
 * 解析单侧轴宽：已提交宽度只能被更宽的需求推开，不会自行收缩。
 *
 * 轴宽是布局属性，缩放、平移、悬停期间保持稳定；否则绘图区宽度会在运动途中
 * 改变，坐标轴与绘图区右缘跟着跳动。只有布局变化后传入 committed=null 才重新评估。
 */
export function resolveAxisWidth(
  floor: number,
  requested: number,
  committed: number | null,
): number {
  return Math.max(floor, requested, committed ?? 0)
}

/** 每条轴的静态/动态轴宽缓存。 */
type AxisWidthParts = {
  static: { left: number; right: number }
  overlay: { left: number; right: number }
}

/** 某一侧轴表面在当前帧的标签最大宽度。 */
function maxLabelWidth(
  frame: AxisWidthFrame,
  surface: 'yLeftStatic' | 'yLeftOverlay' | 'yRightStatic' | 'yRightOverlay',
  axisId: string,
): number {
  const labels = frame.labels.forSurface(surface, axisId).labels
  return Math.max(0, ...labels.map(estimateLabelWidth))
}

/** 按静态/动态分组更新单条轴宽。 */
function updatePartWidths(
  frame: AxisWidthFrame,
  axisId: string,
  part: 'static' | 'overlay',
  widths: AxisWidthParts,
): void {
  const update = part === 'static' ? frame.updateStatic : frame.updateOverlay
  if (!update) return
  const left = part === 'static' ? 'yLeftStatic' : 'yLeftOverlay'
  const right = part === 'static' ? 'yRightStatic' : 'yRightOverlay'
  widths[part] = {
    left: maxLabelWidth(frame, left, axisId),
    right: maxLabelWidth(frame, right, axisId),
  }
}

/** 保留未重绘表面的宽度；同一窗格按列求和，不同窗格共享右侧空间。 */
export class AxisWidthEstimator {
  private readonly widths = new Map<string, AxisWidthParts>()

  /** 输入本帧最终标签，返回左右两侧所需宽度与逐列宽度。 */
  estimate(frame: AxisWidthFrame): AxisWidths {
    const visible = new Set(frame.axes.map((axis) => axis.axisId))
    for (const id of this.widths.keys()) {
      if (!visible.has(id)) this.widths.delete(id)
    }
    const result: AxisWidths = { left: 0, right: 0, rightByAxis: {} }
    const rightByAxis: Record<string, number> = {}
    const rightByPane = new Map<string, number>()
    for (const axis of frame.axes) {
      const widths = this.widths.get(axis.axisId) ?? {
        static: { left: 0, right: 0 },
        overlay: { left: 0, right: 0 },
      }
      for (const part of ['static', 'overlay'] as const) {
        updatePartWidths(frame, axis.axisId, part, widths)
        result.left = Math.max(result.left, widths[part].left)
      }
      const right = Math.max(widths.static.right, widths.overlay.right)
      rightByAxis[axis.axisId] = right
      rightByPane.set(axis.paneId, (rightByPane.get(axis.paneId) ?? 0) + right)
      this.widths.set(axis.axisId, widths)
    }
    // 窗格垂直排列，右侧只需要容纳最宽的一个窗格，不能跨窗格累加。
    result.right = Math.max(0, ...rightByPane.values())
    return { ...result, rightByAxis }
  }

  /** 按轴顺序生成右轴列布局；未测量过的轴宽度为 0。 */
  getLayout(axisIds: ReadonlyArray<string>): Record<string, AxisColumnLayout> {
    const layout: Record<string, AxisColumnLayout> = {}
    let left = 0
    for (const axisId of axisIds) {
      const parts = this.widths.get(axisId)
      const width = Math.max(parts?.static.right ?? 0, parts?.overlay.right ?? 0)
      layout[axisId] = { left, width }
      left += width
    }
    return layout
  }
}
