// 线段标签布局模块：计算线/箭头附属文本的锚点，供绘制与命中热点共用。
// 锚点取语义位置（start/center/end），再沿当前屏幕线段的上侧法线偏移，
// 保证提示框与绘制文字重合、且不压在线上阻塞线段交互。

import type { DrawingLabelPosition } from '../../foundation/plugin'

/** 线段标签沿上侧法线偏移的距离（px）。绘制文字与命中热点共用此值。 */
export const LINE_LABEL_NORMAL_OFFSET = 6

/** 线段/箭头标签的绘制基线：锚点即文本块底边，文字整体落在锚点外侧。 */
export const LINE_LABEL_BASELINE = 'bottom' as const

/** 线段标签锚点布局：偏移后的锚点、可读旋转角与端点对齐方式。 */
export function resolveLineLabelLayout(
  start: { x: number; y: number },
  end: { x: number; y: number },
  position: DrawingLabelPosition | undefined,
): { x: number; y: number; rotation: number; align: CanvasTextAlign } {
  const ratio = position === 'start' ? 0 : position === 'end' ? 1 : 0.5
  const x = start.x + (end.x - start.x) * ratio
  const y = start.y + (end.y - start.y) * ratio
  let rotation = Math.atan2(end.y - start.y, end.x - start.x)
  if (rotation > Math.PI / 2) rotation -= Math.PI
  if (rotation <= -Math.PI / 2) rotation += Math.PI

  const align = position === 'start' ? 'left' : position === 'end' ? 'right' : 'center'

  return {
    x: x + Math.sin(rotation) * LINE_LABEL_NORMAL_OFFSET,
    y: y - Math.cos(rotation) * LINE_LABEL_NORMAL_OFFSET,
    rotation,
    align,
  }
}
