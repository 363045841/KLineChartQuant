/** 绘图框选会话的几何命中与临时 primitive 投影。 */
import type { DrawingViewportPort } from '@/controllers/types.js'
import { rectFromPoints, segmentIntersectsRect } from '@/foundation/geometry/index.js'
import type { DrawingPrimitive } from '@/foundation/plugin/index.js'
import type { ColorTokens } from '@/foundation/tokens/index.js'
import type { DrawingObject } from '../../types.js'
import type { DrawingSelectionMarquee } from '../types.js'
import type { HitTester } from './HitTester.js'

export type { DrawingSelectionMarquee } from '../types.js'

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
  const { left, top, right, bottom } = rectFromPoints(marquee.start, marquee.end)
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
  adapter: DrawingViewportPort,
): boolean {
  const rect = rectFromPoints(marquee.start, marquee.end)
  return hitTester
    .getDrawingLineSegments(drawing, adapter)
    .some((segment) => segmentIntersectsRect(segment.a, segment.b, rect))
}
