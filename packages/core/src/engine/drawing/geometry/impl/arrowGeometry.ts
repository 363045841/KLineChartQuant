/**
 * 箭头头部几何：默认尺寸与两翼坐标由绘制和命中检测共用。
 */

import type { Point } from '@/foundation/geometry/index.js'

/** 箭头头部默认长度（px）。 */
export const ARROW_HEAD_LENGTH = 10
/** 箭头头部默认半角。 */
export const ARROW_HEAD_ANGLE = Math.PI / 6

/** 箭头头部：轴线方向角与两翼端点。 */
export interface ArrowHead {
  readonly angle: number
  readonly left: Point
  readonly right: Point
}

/**
 * 计算从 start 指向 end 的箭头头部。
 * @param start 轴线起点
 * @param end 尖端
 * @param length 头部长度
 * @param angle 两翼相对轴线的半角
 * @returns 轴线方向角与两翼端点
 */
export function arrowHead(
  start: Point,
  end: Point,
  length = ARROW_HEAD_LENGTH,
  angle = ARROW_HEAD_ANGLE,
): ArrowHead {
  const direction = Math.atan2(end.y - start.y, end.x - start.x)
  return {
    angle: direction,
    left: {
      x: end.x - length * Math.cos(direction - angle),
      y: end.y - length * Math.sin(direction - angle),
    },
    right: {
      x: end.x - length * Math.cos(direction + angle),
      y: end.y - length * Math.sin(direction + angle),
    },
  }
}
