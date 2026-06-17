import type { KLineData } from '@363045841yyt/klinechart-core/controllers'

export function getKLineIndexByTimestamp(
  data: ReadonlyArray<KLineData>,
  timestamp: number,
): number | null {
  let low = 0
  let high = data.length - 1
  while (low <= high) {
    const mid = (low + high) >>> 1
    const ts = data[mid]!.timestamp
    if (ts === timestamp) return mid
    if (ts < timestamp) low = mid + 1
    else high = mid - 1
  }
  return null
}
