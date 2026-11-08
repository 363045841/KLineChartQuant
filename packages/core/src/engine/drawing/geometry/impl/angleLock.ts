/**
 * Shift 锁角：把落点绕参考点投影到最近的 45° 倍数方向上。
 *
 * 这是方向约束而不是值吸附——不采集候选、不写回领域原值，只改写落点的屏幕向量，
 * 因此与 magnet 完全独立；两者的互斥由交互层的修饰键映射保证。
 * 坐标一律是 Pane 局部逻辑像素，像素等比，算出的 45° 就是视觉上的 45°。
 */

import type { Point } from '@/foundation/geometry/index.js'
import { ANGLE_LOCK_MIN_DELTA, ANGLE_LOCK_STEP } from '../types.js'

/**
 * 把落点锁定到以 origin 为圆心、距离不变、方向最接近的 45° 倍数射线上。
 * @param origin 参考点（Pane 局部逻辑像素）
 * @param point 原始落点（Pane 局部逻辑像素）
 * @returns 锁定后的落点；位移小于阈值时原样返回，避免参考点附近抖动
 */
export function lockAngle(origin: Point, point: Point): Point {
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  const distance = Math.hypot(dx, dy)
  if (distance < ANGLE_LOCK_MIN_DELTA) return point
  // atan2 落在 (-π, π]，四舍五入到 π/4 的整数倍即可覆盖全部 8 个方向，无需分象限处理。
  const angle = Math.round(Math.atan2(dy, dx) / ANGLE_LOCK_STEP) * ANGLE_LOCK_STEP
  return {
    x: origin.x + Math.cos(angle) * distance,
    y: origin.y + Math.sin(angle) * distance,
  }
}
