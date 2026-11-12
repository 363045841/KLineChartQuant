/** 锁定垂直光标在当前帧的投影：把锁定时间映射到目标周期的真实 K 线或未来槽位。 */

import type { CrosshairLock } from '@/engine/state/interactionState.js'
import type { FrameCoordinates } from '@/foundation/geometry/frameCoordinates.js'

/** 锁定竖线的当前帧结果；索引供时间轴标签复用。 */
export interface LockedCrosshairProjection {
  readonly index: number
  readonly x: number
}

/**
 * 计算锁定竖线在目标周期的槽位。
 *
 * 更细周期取该桶第一根，更粗周期取包含该时间的桶；未来时间按常规槽距外推，
 * 不要求槽位已有真实 K 线。时间早于数据起点、或目标 Bar 覆盖不到锁定时间时返回 null。
 *
 * @param lock 锁定来源：槽位时间与锁定当时的常规槽距
 * @param coordinates 当前帧时间与像素投影
 * @returns 可绘制的槽位与屏幕 x；无法映射时为 null
 */
export function resolveLockedCrosshair(
  lock: CrosshairLock,
  coordinates: FrameCoordinates,
): LockedCrosshairProjection | null {
  const logical = coordinates.timeToLogical(lock.timestamp)
  if (logical === null) return null

  const slot = resolveLockedSlot(logical, coordinates.seriesInterval, lock.intervalMs)
  if (slot < 0) return null
  if (!coversLockedTime(coordinates.slotToTime(slot), lock, coordinates.seriesInterval)) return null

  const x = coordinates.logicalToX(slot)
  return x === null ? null : { index: slot, x }
}

/** 按周期粗细决定取整方向；缺少槽距时退化为最近槽位。 */
function resolveLockedSlot(
  logical: number,
  currentIntervalMs: number,
  lockedIntervalMs: number,
): number {
  if (currentIntervalMs <= 0 || lockedIntervalMs <= 0 || currentIntervalMs === lockedIntervalMs) {
    return Math.round(logical)
  }
  return currentIntervalMs < lockedIntervalMs ? Math.ceil(logical) : Math.floor(logical)
}

/** 目标 Bar 的时间范围必须真正覆盖锁定时间，否则视为该周期没有对应位置。 */
function coversLockedTime(
  barTime: number | null,
  lock: CrosshairLock,
  currentIntervalMs: number,
): boolean {
  if (barTime === null) return false
  if (currentIntervalMs <= 0 || lock.intervalMs <= 0) return barTime === lock.timestamp
  if (currentIntervalMs === lock.intervalMs) return barTime === lock.timestamp
  if (currentIntervalMs < lock.intervalMs) {
    return barTime >= lock.timestamp && barTime < lock.timestamp + lock.intervalMs
  }
  return barTime <= lock.timestamp && lock.timestamp < barTime + currentIntervalMs
}
