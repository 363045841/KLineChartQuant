// 组合图元的填充区域：按持久化锚点下标声明多边形环绕顺序，绘制与命中共用同一份顺序。
// 只有由四个持久化锚点直接围成填充的通道图元在此登记；矩形与回归通道的填充另有推导。

import type { Point } from '@/foundation/geometry/index.js'
import type { DrawingKind } from '../../types.js'

/**
 * 各通道图元的填充区域锚点环绕顺序。
 * 平行通道、平滑顶底的第二条线起点在左端，顺序为 [0, 1, 3, 2]；
 * 不相交通道的第二条线起点在右端，顺序为 [0, 1, 2, 3]。
 */
const FILL_ANCHOR_ORDERS: Partial<Record<DrawingKind, readonly number[]>> = {
  'parallel-channel': [0, 1, 3, 2],
  'flat-line': [0, 1, 3, 2],
  'disjoint-channel': [0, 1, 2, 3],
}

/**
 * 按图元种类把屏幕锚点排成填充多边形。
 * @param kind 图元种类
 * @param anchorsOnScreen 与持久化锚点同序的屏幕坐标（须全为点投影）
 * @returns 填充多边形顶点；未登记或缺少任一锚点时返回空数组
 */
export function buildFillPolygon(
  kind: DrawingKind,
  anchorsOnScreen: ReadonlyArray<Point>,
): Point[] {
  const order = FILL_ANCHOR_ORDERS[kind]
  if (!order) return []
  const points: Point[] = []
  for (const index of order) {
    const point = anchorsOnScreen[index]
    if (!point) return []
    points.push(point)
  }
  return points
}
