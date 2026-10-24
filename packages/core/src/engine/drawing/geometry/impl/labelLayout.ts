// 绘图文字摆放模块：所有图元文字的锚点、对齐与偏移在此决定，绘制与命中共享同一约定。
// - 线段/箭头标签：语义位置 + 上侧法线偏移，避免压在线上阻塞交互；
// - 填充区域标签：按包围盒水平内缩；
// - 独立标签与 Box 文字：锚点 + 可选像素级垂直偏移（offsetY，正数向上）；
// - 斐波那契层级文字：贴着水平线右端外侧。

import type { DrawingText } from '@363045841yyt/klinechart-plot-contracts'
import type { Point } from '@/foundation/geometry/index.js'
import type { DrawingLabelPosition } from '@/foundation/plugin/index.js'

/** 线段标签沿上侧法线偏移的距离（px）。绘制文字与命中热点共用此值。 */
export const LINE_LABEL_NORMAL_OFFSET = 6

/** 线段/箭头标签的绘制基线：锚点即文本块底边，文字整体落在锚点外侧。 */
export const LINE_LABEL_BASELINE = 'bottom' as const

/** 斐波那契层级文字与水平线右端的间距（px）。 */
export const FIB_LABEL_GAP = 4

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

/** 填充区域标签按包围盒水平对齐，绘制和热点使用同一个锚点。 */
export function resolveAreaLabelLayout(
  left: number,
  right: number,
  position: DrawingLabelPosition | undefined,
): { x: number; align: CanvasTextAlign } {
  const inset = Math.min(6, (right - left) / 2)
  if (position === 'start') return { x: left + inset, align: 'left' }
  if (position === 'end') return { x: right - inset, align: 'right' }
  return { x: (left + right) / 2, align: 'center' }
}

/** 独立标签：锚点加垂直偏移（正数向上），对齐与基线沿用文字模型。 */
export function resolvePointLabelLayout(
  anchor: Point,
  text: Pick<DrawingText, 'align' | 'verticalAlign' | 'offsetY'>,
): { point: Point; align: DrawingText['align']; baseline: DrawingText['verticalAlign'] } {
  return {
    point: { x: anchor.x, y: anchor.y - (text.offsetY ?? 0) },
    align: text.align,
    baseline: text.verticalAlign,
  }
}

/** 框内文字：水平按左右边界、垂直按上下边界定位，再叠加统一垂直偏移。 */
export function resolveRectLabelLayout(
  topLeft: Point,
  topRight: Point,
  bottomLeft: Point,
  text: Pick<DrawingText, 'align' | 'verticalAlign' | 'offsetY'>,
): { point: Point; align: DrawingText['align']; baseline: DrawingText['verticalAlign'] } {
  const x =
    text.align === 'left'
      ? topLeft.x
      : text.align === 'right'
        ? topRight.x
        : (topLeft.x + topRight.x) / 2
  const y =
    text.verticalAlign === 'top'
      ? topLeft.y
      : text.verticalAlign === 'bottom'
        ? bottomLeft.y
        : (topLeft.y + bottomLeft.y) / 2
  return {
    point: { x, y: y - (text.offsetY ?? 0) },
    align: text.align,
    baseline: text.verticalAlign,
  }
}

/** 斐波那契层级文字：水平线右端外侧固定间距，垂直居中于该层级。 */
export function resolveFibLabelLayout(
  right: number,
  y: number,
): { point: Point; baseline: 'middle' } {
  return { point: { x: right + FIB_LABEL_GAP, y }, baseline: 'middle' }
}
