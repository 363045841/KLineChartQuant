/**
 * 线段裁剪：Cohen–Sutherland 矩形裁剪与视口延长裁剪。
 *
 * 纯几何函数，不依赖 Canvas，供 primitive 渲染器在绘制前调用。
 */

import type { LinePrimitive } from '../../../../foundation/plugin/index.js'

/** 视口裁剪矩形（屏幕坐标，含边界）。 */
type ClipRect = { left: number; top: number; right: number; bottom: number }

/**
 * Cohen–Sutherland 算法将线段裁剪到矩形内。
 *
 * @returns 裁剪后的两端点；线段完全在矩形外时返回 null。
 */
export function clipLineToRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: ClipRect,
): { a: { x: number; y: number }; b: { x: number; y: number } } | null {
  const INSIDE = 0
  const LEFT = 1
  const RIGHT = 2
  const BOTTOM = 4
  const TOP = 8

  const computeCode = (x: number, y: number) => {
    let code = INSIDE
    if (x < rect.left) code |= LEFT
    else if (x > rect.right) code |= RIGHT
    if (y < rect.top) code |= TOP
    else if (y > rect.bottom) code |= BOTTOM
    return code
  }

  let ax = x1
  let ay = y1
  let bx = x2
  let by = y2

  while (true) {
    const codeA = computeCode(ax, ay)
    const codeB = computeCode(bx, by)

    if (!(codeA | codeB)) {
      return { a: { x: ax, y: ay }, b: { x: bx, y: by } }
    }

    if (codeA & codeB) {
      return null
    }

    const codeOut = codeA || codeB
    let x = 0
    let y = 0

    if (codeOut & TOP) {
      x = ax + ((bx - ax) * (rect.top - ay)) / (by - ay)
      y = rect.top
    } else if (codeOut & BOTTOM) {
      x = ax + ((bx - ax) * (rect.bottom - ay)) / (by - ay)
      y = rect.bottom
    } else if (codeOut & RIGHT) {
      y = ay + ((by - ay) * (rect.right - ax)) / (bx - ax)
      x = rect.right
    } else {
      y = ay + ((by - ay) * (rect.left - ax)) / (bx - ax)
      x = rect.left
    }

    if (codeOut === codeA) {
      ax = x
      ay = y
    } else {
      bx = x
      by = y
    }
  }
}

/**
 * 按 primitive 的 extend 语义把线段延长后再裁剪到视口。
 *
 * @returns 裁剪后的两端点；完全在视口外或退化线段返回 null。
 */
export function extendLineToViewport(
  primitive: LinePrimitive,
  viewportClip: ClipRect,
): { a: { x: number; y: number }; b: { x: number; y: number } } | null {
  const { a, b, extend = 'none' } = primitive
  if (extend === 'none') {
    return clipLineToRect(a.x, a.y, b.x, b.y, viewportClip)
  }

  const dx = b.x - a.x
  const dy = b.y - a.y
  if (dx === 0 && dy === 0) return null

  const distance =
    Math.max(viewportClip.right - viewportClip.left, viewportClip.bottom - viewportClip.top) * 4
  let start = a
  let end = b

  if (extend === 'left' || extend === 'both') {
    start = { x: a.x - dx * distance, y: a.y - dy * distance }
  }
  if (extend === 'right' || extend === 'both') {
    end = { x: b.x + dx * distance, y: b.y + dy * distance }
  }

  return clipLineToRect(start.x, start.y, end.x, end.y, viewportClip)
}
