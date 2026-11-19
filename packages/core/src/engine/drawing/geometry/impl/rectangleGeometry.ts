/** 矩形渲染和标签命中共用的屏幕边界与边名称。 */
import type { Point } from '@/foundation/geometry/index.js'
import type { DrawingObject } from '../../types.js'

/** 计算填充边界和可绘制的边。延伸的一侧不封口。 */
export function rectangleGeometry(
  [topLeft, topRight, bottomRight, bottomLeft]: readonly [Point, Point, Point, Point],
  extend: DrawingObject['extend'],
  viewportLeft: number,
  viewportRight: number,
) {
  const extendLeft = extend === 'left' || extend === 'both'
  const extendRight = extend === 'right' || extend === 'both'
  const left = extendLeft ? Math.min(topLeft.x, viewportLeft) : topLeft.x
  const right = extendRight ? Math.max(topRight.x, viewportRight) : topRight.x
  const points = [
    { x: left, y: topLeft.y },
    { x: right, y: topRight.y },
    { x: right, y: bottomRight.y },
    { x: left, y: bottomLeft.y },
  ] as const
  const edges = [
    { labelTarget: 'top', a: points[0], b: points[1] },
    { labelTarget: 'right', a: topRight, b: bottomRight },
    { labelTarget: 'bottom', a: points[2], b: points[3] },
    { labelTarget: 'left', a: bottomLeft, b: topLeft },
  ] as const
  return {
    points: [...points],
    edges: edges.filter(({ labelTarget }) =>
      labelTarget === 'right' ? !extendRight : labelTarget !== 'left' || !extendLeft,
    ),
  }
}
