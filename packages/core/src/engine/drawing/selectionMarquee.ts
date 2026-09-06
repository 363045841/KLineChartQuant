/** 绘图框选会话的几何命中与临时 primitive 投影。 */
import type { DrawingChartAdapter } from '../../controllers/types'
import type { DrawingObject, DrawingPrimitive, ScreenPoint } from '../../foundation/plugin'
import type { ColorTokens } from '../../foundation/tokens'

import type { HitTester } from './HitTester'

/** 框选状态使用 Pane 内逻辑像素，不进入 kernel 或持久化图元。 */
export type DrawingSelectionMarquee = {
  paneId: string
  start: ScreenPoint
  end: ScreenPoint
}

/** 防止点击被误解释为一次框选。 */
const MIN_SELECTION_SIZE = 3

/** 判断框选是否已形成足以执行选择的区域。 */
export function hasSelectionMarqueeArea(marquee: DrawingSelectionMarquee): boolean {
  return (
    Math.abs(marquee.end.x - marquee.start.x) >= MIN_SELECTION_SIZE &&
    Math.abs(marquee.end.y - marquee.start.y) >= MIN_SELECTION_SIZE
  )
}

/** 将框选状态投影为填充区域和四条虚线边框。 */
export function createSelectionMarqueePrimitives(
  marquee: DrawingSelectionMarquee,
  colors: ColorTokens,
): DrawingPrimitive[] {
  const left = Math.min(marquee.start.x, marquee.end.x)
  const right = Math.max(marquee.start.x, marquee.end.x)
  const top = Math.min(marquee.start.y, marquee.end.y)
  const bottom = Math.max(marquee.start.y, marquee.end.y)
  const topLeft = { x: left, y: top }
  const topRight = { x: right, y: top }
  const bottomRight = { x: right, y: bottom }
  const bottomLeft = { x: left, y: bottom }
  const borderStyle = { stroke: colors.selectionStroke, strokeStyle: 'dashed' as const }

  return [
    {
      kind: 'area',
      points: [topLeft, topRight, bottomRight, bottomLeft],
      closed: true,
      style: { fill: colors.selectionFill, fillOpacity: 0.15 },
    },
    { kind: 'line', a: topLeft, b: topRight, style: borderStyle },
    { kind: 'line', a: topRight, b: bottomRight, style: borderStyle },
    { kind: 'line', a: bottomRight, b: bottomLeft, style: borderStyle },
    { kind: 'line', a: bottomLeft, b: topLeft, style: borderStyle },
  ]
}

/** 判断图元的任一可见线段是否与框选区域相交。 */
export function drawingIntersectsSelectionMarquee(
  drawing: DrawingObject,
  marquee: DrawingSelectionMarquee,
  hitTester: HitTester,
  adapter: DrawingChartAdapter,
): boolean {
  const left = Math.min(marquee.start.x, marquee.end.x)
  const right = Math.max(marquee.start.x, marquee.end.x)
  const top = Math.min(marquee.start.y, marquee.end.y)
  const bottom = Math.max(marquee.start.y, marquee.end.y)

  return hitTester
    .getDrawingLineSegments(drawing, adapter)
    .some((segment) => segmentIntersectsRect(segment.a, segment.b, { left, right, top, bottom }))
}

/** 判断线段是否穿过或落在轴对齐矩形内。 */
function segmentIntersectsRect(
  a: ScreenPoint,
  b: ScreenPoint,
  rect: { left: number; right: number; top: number; bottom: number },
): boolean {
  if (pointInRect(a, rect) || pointInRect(b, rect)) return true

  const topLeft = { x: rect.left, y: rect.top }
  const topRight = { x: rect.right, y: rect.top }
  const bottomRight = { x: rect.right, y: rect.bottom }
  const bottomLeft = { x: rect.left, y: rect.bottom }
  return (
    segmentsIntersect(a, b, topLeft, topRight) ||
    segmentsIntersect(a, b, topRight, bottomRight) ||
    segmentsIntersect(a, b, bottomRight, bottomLeft) ||
    segmentsIntersect(a, b, bottomLeft, topLeft)
  )
}

/** 判断点是否位于矩形边界或内部。 */
function pointInRect(
  point: ScreenPoint,
  rect: { left: number; right: number; top: number; bottom: number },
): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
}

/** 使用叉积判断两个闭合线段是否相交。 */
function segmentsIntersect(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint, d: ScreenPoint): boolean {
  const abC = cross(a, b, c)
  const abD = cross(a, b, d)
  const cdA = cross(c, d, a)
  const cdB = cross(c, d, b)
  if (abC === 0 && pointOnSegment(c, a, b)) return true
  if (abD === 0 && pointOnSegment(d, a, b)) return true
  if (cdA === 0 && pointOnSegment(a, c, d)) return true
  if (cdB === 0 && pointOnSegment(b, c, d)) return true
  return (abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0)
}

/** 返回有向线段 AB 与点 C 的叉积。 */
function cross(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

/** 判断共线点是否落在线段端点范围内。 */
function pointOnSegment(point: ScreenPoint, a: ScreenPoint, b: ScreenPoint): boolean {
  return (
    point.x >= Math.min(a.x, b.x) &&
    point.x <= Math.max(a.x, b.x) &&
    point.y >= Math.min(a.y, b.y) &&
    point.y <= Math.max(a.y, b.y)
  )
}
