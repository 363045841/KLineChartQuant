/** 可见区间捕获：当前可见的 K 线范围 → 时间区间快照。 */
import type { SeriesViewportSnapshot } from '../types.js'

/**
 * 捕获当前可见区间。
 *
 * 区间取可见范围内第一根与最后一根 K 线的时间；数据为空或区间无效时返回 null。
 *
 * @param bars - 当前已加载的 K 线（升序）
 * @param range - 可见槽位范围；`end` 为排他下标
 * @returns 可恢复的时间区间，或 null
 */
export function captureRange(
  bars: readonly { readonly timestamp: number }[],
  range: { readonly start: number; readonly end: number },
): SeriesViewportSnapshot | null {
  const start = Math.max(0, range.start)
  const end = Math.min(bars.length, range.end) - 1
  if (start > end) return null
  const from = bars[start]?.timestamp
  const to = bars[end]?.timestamp
  if (from === undefined || to === undefined || to < from) return null
  return { fromTime: from, toTime: to }
}
