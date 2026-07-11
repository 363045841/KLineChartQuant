/**
 * 标记形状绘制函数
 * 支持 6 种预设形状：arrow_up, arrow_down, flag, circle, rectangle, diamond
 */

import type { MarkerShapeType, MarkerStyle, MarkerLabel } from './types'

/** 默认尺寸映射 */
const DEFAULT_SIZES: Record<MarkerShapeType, number> = {
  arrow_up: 16,
  arrow_down: 16,
  flag: 14,
  circle: 12,
  rectangle: 14,
  diamond: 12,
}

/**
 * 绘制标记形状
 */
export function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: MarkerShapeType,
  x: number,
  y: number,
  size: number,
  style: MarkerStyle,
): void {
  const fillColor = style.fillColor || '#000000'
  const strokeColor = style.strokeColor || fillColor
  const actualSize = size || DEFAULT_SIZES[shape]

  ctx.fillStyle = fillColor
  ctx.strokeStyle = strokeColor
  ctx.lineWidth = style.lineWidth || 1

  if (style.opacity !== undefined) {
    ctx.globalAlpha = style.opacity
  }

  switch (shape) {
    case 'arrow_up':
      drawArrowUp(ctx, x, y, actualSize)
      break
    case 'arrow_down':
      drawArrowDown(ctx, x, y, actualSize)
      break
    case 'circle':
      drawCircle(ctx, x, y, actualSize)
      break
    case 'rectangle':
      drawRectangle(ctx, x, y, actualSize)
      break
    case 'diamond':
      drawDiamond(ctx, x, y, actualSize)
      break
    case 'flag':
      drawFlag(ctx, x, y, actualSize)
      break
  }

  ctx.globalAlpha = 1
}

/** 标签最大宽度倍数（相对于 marker size） */
const LABEL_MAX_WIDTH_SCALE = 2.5
/** 标签与 marker 的间距 */
const LABEL_GAP = 4

/**
 * 绘制文本标注
 * @param isAboveMarker 标记是否在K线上方（true → 文字在标记上方，false → 文字在标记下方）
 */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  label: MarkerLabel,
  x: number,
  y: number,
  markerSize: number,
  style: MarkerStyle,
  isAboveMarker: boolean = false,
): void {
  const fontSize = label.fontSize || 12
  const textColor = style.textColor || '#333333'
  const markerRadius = markerSize / 2

  ctx.font = `${fontSize}px sans-serif`
  ctx.fillStyle = textColor
  ctx.textBaseline = 'middle'

  // 计算最大文本宽度（基于 marker size）
  const maxWidth = markerSize * LABEL_MAX_WIDTH_SCALE

  // 截断文本
  const displayText = truncateText(ctx, label.text, maxWidth)

  // 计算文本位置
  const textWidth = ctx.measureText(displayText).width
  let textX = x
  let textY = y

  switch (label.position) {
    case 'left':
      // 在 marker 左侧
      textX = x - markerRadius - textWidth / 2 - LABEL_GAP
      break
    case 'right':
      // 在 marker 右侧
      textX = x + markerRadius + textWidth / 2 + LABEL_GAP
      break
    case 'top':
      // 强制在 marker 上方
      textY = y - markerRadius - fontSize / 2 - LABEL_GAP
      break
    case 'bottom':
      // 强制在 marker 下方
      textY = y + markerRadius + fontSize / 2 + LABEL_GAP
      break
    case 'inside':
    default:
      // 默认：根据标记位置自动决定
      if (isAboveMarker) {
        // 标记在K线上方 → 文字在标记上方
        textY = y - markerRadius - fontSize / 2 - LABEL_GAP
      } else {
        // 标记在K线下方 → 文字在标记下方
        textY = y + markerRadius + fontSize / 2 + LABEL_GAP
      }
      break
  }

  // 应用偏移
  if (label.offset) {
    textX += label.offset.x || 0
    textY += label.offset.y || 0
  }

  // 对齐方式
  ctx.textAlign = label.align || 'center'

  ctx.fillText(displayText, textX, textY)
}

/**
 * 截断文本
 * @param ctx Canvas 上下文
 * @param text 原始文本
 * @param maxWidth 最大宽度
 * @returns 截断后的文本（带省略号）
 */
function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  const fullWidth = ctx.measureText(text).width
  if (fullWidth <= maxWidth) return text

  // 添加省略号后测量
  const ellipsis = '…'
  const ellipsisWidth = ctx.measureText(ellipsis).width

  // 二分查找最大可显示字符数
  let left = 0
  let right = text.length
  while (left < right) {
    const mid = Math.ceil((left + right) / 2)
    const truncated = text.slice(0, mid)
    const width = ctx.measureText(truncated).width + ellipsisWidth
    if (width <= maxWidth) {
      left = mid
    } else {
      right = mid - 1
    }
  }

  return text.slice(0, left) + ellipsis
}

// ============ 形状绘制函数 ============

function drawArrowUp(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.beginPath()
  ctx.moveTo(x, y - size / 2)
  ctx.lineTo(x - size / 2, y + size / 2)
  ctx.lineTo(x + size / 2, y + size / 2)
  ctx.closePath()
  ctx.fill()
}

function drawArrowDown(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.beginPath()
  ctx.moveTo(x, y + size / 2)
  ctx.lineTo(x - size / 2, y - size / 2)
  ctx.lineTo(x + size / 2, y - size / 2)
  ctx.closePath()
  ctx.fill()
}

function drawCircle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.beginPath()
  ctx.arc(x, y, size / 2, 0, Math.PI * 2)
  ctx.fill()
}

function drawRectangle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.fillRect(x - size / 2, y - size / 2, size, size)
}

function drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.beginPath()
  ctx.moveTo(x, y - size / 2)
  ctx.lineTo(x + size / 2, y)
  ctx.lineTo(x, y + size / 2)
  ctx.lineTo(x - size / 2, y)
  ctx.closePath()
  ctx.fill()
}

function drawFlag(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  // 旗杆
  ctx.beginPath()
  ctx.moveTo(x - size / 4, y + size / 2)
  ctx.lineTo(x - size / 4, y - size / 2)
  ctx.stroke()

  // 旗帜
  ctx.beginPath()
  ctx.moveTo(x - size / 4, y - size / 2)
  ctx.lineTo(x + size / 2, y - size / 4)
  ctx.lineTo(x - size / 4, y)
  ctx.closePath()
  ctx.fill()
}

/**
 * 点击测试（判断点是否在形状内）
 */
export function hitTestShape(
  mx: number,
  my: number,
  shape: MarkerShapeType,
  x: number,
  y: number,
  size: number,
): boolean {
  const half = size / 2

  switch (shape) {
    case 'circle':
      const dx = mx - x
      const dy = my - y
      return dx * dx + dy * dy <= half * half

    case 'rectangle':
    case 'diamond':
    case 'arrow_up':
    case 'arrow_down':
    case 'flag':
    default:
      // 使用包围盒测试
      return mx >= x - half && mx <= x + half && my >= y - half && my <= y + half
  }
}
