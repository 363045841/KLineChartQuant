/** 按时间戳查找区间边界，K 线与已提交帧数据共用同一查找规则。 */

function binarySearch(
  data: ReadonlyArray<{ timestamp: number }>,
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

export function findNearestKLineIndex(
  data: ReadonlyArray<{ timestamp: number }>,
  timestamp: number,
  direction: 'left' | 'right',
): number | null {
  if (data.length === 0) return null
  const { low, high } = binarySearch(data, timestamp)
  if (low === high) return low
  if (direction === 'left') {
    return high >= 0 ? high : low < data.length ? low : null
  }
  return low < data.length ? low : high
}
