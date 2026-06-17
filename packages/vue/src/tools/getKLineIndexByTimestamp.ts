import type { KLineData } from '@363045841yyt/klinechart-core/controllers'

function binarySearch(
  data: ReadonlyArray<KLineData>,
  timestamp: number,
): { low: number; high: number } {
  let low = 0
  let high = data.length - 1
  while (low <= high) {
    const mid = (low + high) >>> 1
    const ts = data[mid]!.timestamp
    if (ts === timestamp) return { low: mid, high: mid }
    if (ts < timestamp) low = mid + 1
    else high = mid - 1
  }
  return { low, high }
}

export function getKLineIndexByTimestamp(
  data: ReadonlyArray<KLineData>,
  timestamp: number,
): number | null {
  if (data.length === 0) return null
  const { low, high } = binarySearch(data, timestamp)
  return low === high ? low : null
}

export function findNearestKLineIndex(
  data: ReadonlyArray<KLineData>,
  timestamp: number,
  direction: 'left' | 'right',
): number | null {
  if (data.length === 0) return null
  const { low, high } = binarySearch(data, timestamp)
  if (low === high) return low
  if (direction === 'left') {
    return high >= 0 ? high : (low < data.length ? low : null)
  }
  return low < data.length ? low : high
}
