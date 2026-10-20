/**
 * 矩形几何：两个对角点确定的四角与四条边，绘制和命中检测共用同一份推导。
 */

import { type Point, rectFromPoints } from '@/foundation/geometry/index.js'

/** 矩形四角与顺时针四条边（屏幕坐标）。 */
export interface RectangleGeometry {
  readonly topLeft: Point
  readonly topRight: Point
  readonly bottomRight: Point
  readonly bottomLeft: Point
  readonly edges: ReadonlyArray<{ readonly a: Point; readonly b: Point }>
}

/**
 * 由两个对角点推导矩形几何。
 * @param a 第一个对角点的屏幕坐标
 * @param b 第二个对角点的屏幕坐标
 * @returns 四角与顺时针四条边
 */
export function rectangleGeometry(a: Point, b: Point): RectangleGeometry {
  const { left, top, right, bottom } = rectFromPoints(a, b)
  const topLeft = { x: left, y: top }
  const topRight = { x: right, y: top }
  const bottomRight = { x: right, y: bottom }
  const bottomLeft = { x: left, y: bottom }
  return {
    topLeft,
    topRight,
    bottomRight,
    bottomLeft,
    edges: [
      { a: topLeft, b: topRight },
      { a: topRight, b: bottomRight },
      { a: bottomRight, b: bottomLeft },
      { a: bottomLeft, b: topLeft },
    ],
  }
}
