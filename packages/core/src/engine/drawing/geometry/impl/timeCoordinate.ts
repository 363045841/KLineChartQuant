/** 时间坐标解析：在已知时间轴槽位间插值，未来槽位从图表时间轴读取。 */
import { DRAWING_FUTURE_BARS } from '@363045841yyt/klinechart-plot-contracts'

/** 解析任意毫秒坐标，不要求时间戳恰好命中某根 K 线。 */
export function drawingTimeIndex(timestamp: number, data: readonly { timestamp: number }[], axisTime: (index: number) => number | null): number {
  if (!Number.isFinite(timestamp) || data.length === 0) return Number.NaN
  let low = 0
  let high = data.length - 1
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const value = data[middle]!.timestamp
    if (value === timestamp) return middle
    if (value < timestamp) low = middle + 1
    else high = middle - 1
  }
  if (low > 0 && low < data.length) {
    const first = data[low - 1]!.timestamp
    return low - 1 + (timestamp - first) / (data[low]!.timestamp - first)
  }
  if (low === 0) {
    if (data.length < 2) return Number.NaN
    return (timestamp - data[0]!.timestamp) / (data[1]!.timestamp - data[0]!.timestamp)
  }
  // 未来时间由图表日历决定，不能按最近两根 bar 的间隔猜测休市时段。
  let previousIndex = data.length - 1
  let previousTime = data[previousIndex]!.timestamp
  for (let index = data.length; index <= data.length + DRAWING_FUTURE_BARS; index++) {
    const next = axisTime(index)
    if (next === null || !Number.isFinite(next) || next <= previousTime) return Number.NaN
    if (timestamp <= next) return previousIndex + (timestamp - previousTime) / (next - previousTime)
    previousIndex = index
    previousTime = next
  }
  return Number.NaN
}
