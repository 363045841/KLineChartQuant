// 锁定竖线跨周期映射：同周期精确命中，切小周期取桶第一根，切大周期取包含时间的桶，无 K 线时隐藏。
import { describe, expect, it } from 'vitest'
import { createFrameCoordinates } from '@/engine/coordinates/impl/frameCoordinates'
import { ChartDataViewId } from '@/foundation/types/chartView'
import { resolveLockedCrosshair } from '../impl/resolveLockedCrosshair'

const DAY = 86_400_000
const START = Date.UTC(2026, 0, 5)
const OPEN = 9.5 * 3_600_000
const MINUTE_5 = 5 * 60_000

/** 用生产帧坐标服务投影，避免测试自己实现时间换算。 */
function coordinatesOf(bars: ReadonlyArray<{ timestamp: number }>) {
  return createFrameCoordinates({
    data: bars,
    range: { start: 0, end: bars.length },
    kLineCenters: bars.map((_, index) => index * 10),
    scrollLeft: 0,
    dpr: 1,
    kWidth: 10,
    kGap: 0,
    dataView: ChartDataViewId.KLine,
    priceAxis: { priceToY: (price) => price, yToPrice: (y) => y },
  })
}

/** 日线：每个交易日开盘一根。 */
const daily = (days: number) =>
  Array.from({ length: days }, (_, day) => ({ timestamp: START + day * DAY }))

/** 5 分钟：每个交易日 09:30–15:00；`firstIndexOfDay` 供断言桶第一根。 */
function intraday(days: number, skipDay?: number) {
  const bars: Array<{ timestamp: number }> = []
  const firstIndexOfDay: number[] = []
  for (let day = 0; day < days; day += 1) {
    firstIndexOfDay.push(bars.length)
    if (day === skipDay) continue
    const open = START + day * DAY + OPEN
    for (let minute = 0; minute <= 330; minute += 5)
      bars.push({ timestamp: open + minute * 60_000 })
  }
  return { bars, firstIndexOfDay }
}

const lockOf = (timestamp: number, intervalMs: number) => ({ timestamp, intervalMs })

const dayBars = daily(3)
const fine = intraday(3)
const mappingCases = [
  {
    name: '同周期按锁定时间精确命中',
    bars: dayBars,
    lock: lockOf(dayBars[1]!.timestamp, DAY),
    expected: 1,
  },
  {
    name: '切到更小周期落在该桶的第一根 K 线',
    bars: fine.bars,
    lock: lockOf(dayBars[1]!.timestamp, DAY),
    expected: fine.firstIndexOfDay[1]!,
  },
  {
    name: '切到更大周期落在包含该时间的桶',
    bars: dayBars,
    lock: lockOf(fine.bars[76]!.timestamp, MINUTE_5),
    expected: 1,
  },
  {
    name: '未来槽位按常规槽距外推，不受数据长度限制',
    bars: dayBars,
    lock: lockOf(dayBars[2]!.timestamp + 2 * DAY, DAY),
    expected: 4,
  },
]

describe('resolveLockedCrosshair', () => {
  it.each(mappingCases)('$name', ({ bars, lock, expected }) => {
    const coordinates = coordinatesOf(bars)
    const result = resolveLockedCrosshair(lock, coordinates)
    expect(result?.index).toBe(expected)
    expect(result?.x).toBe(coordinates.logicalToX(expected))
  })

  it('切到更粗周期时未来时间仍落在外推桶', () => {
    const bars = daily(2)
    const futureTime = START + 2 * DAY + OPEN
    const result = resolveLockedCrosshair(lockOf(futureTime, MINUTE_5), coordinatesOf(bars))
    expect(result?.index).toBe(2)
  })

  it('目标周期缺少对应 K 线时隐藏', () => {
    const skipped = intraday(3, 1)
    expect(
      resolveLockedCrosshair(lockOf(dayBars[1]!.timestamp, DAY), coordinatesOf(skipped.bars)),
    ).toBeNull()
    expect(resolveLockedCrosshair(lockOf(START - DAY, DAY), coordinatesOf(dayBars))).toBeNull()
  })
})
