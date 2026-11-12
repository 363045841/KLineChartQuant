/** 锁定垂直光标在当前帧的投影：把锁定时间映射到目标周期的一根 K 线。 */

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
 * 更细周期取该桶第一根，更粗周期取包含该时间的桶；新周期没有覆盖锁定时间的 K 线时返回 null。
 */
export function resolveLockedCrosshair(
  lock: CrosshairLock,
  coordinates: FrameCoordinates,
  dataLength: number,
): LockedCrosshairProjection | null {
  const logical = coordinates.timeToLogical(lock.timestamp)
  if (logical === null) return null

  const slot = resolveLockedSlot(logical, coordinates.seriesInterval, lock.intervalMs)
  if (slot < 0 || slot >= dataLength) return null
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

/** 目标 Bar 的时间范围必须真正覆盖锁定时间，否则视为新周期没有对应 K 线。 */
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
