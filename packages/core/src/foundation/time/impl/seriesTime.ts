/**
 * 序列时间投影：时间戳 ↔ 连续逻辑槽位的唯一实现。
 *
 * 真实行情之间插值，两端按当前周期的常规槽距外推；时间轴刻度、帧坐标服务共用
 * 同一份规则，因此留白槽位与真实行情不会出现两套换算。
 */

import type { TimeProjection } from '../types.js'

/** 行情序列的常规槽距缓存；按首尾时间与长度失效，避免每次重绘重新统计。 */
interface SeriesCadence {
  readonly first: number | undefined
  readonly last: number | undefined
  readonly length: number
  readonly interval: number
}

const cadenceBySeries = new WeakMap<ReadonlyArray<{ timestamp: number }>, SeriesCadence>()

/** 有限的坐标值才可以离开坐标边界。 */
function finite(value: number): number | null {
  return Number.isFinite(value) ? value : null
}

/**
 * 常规槽距：相邻时间差中出现次数最多的正值。
 *
 * 休市、节假日只会产生更大的间隔，按出现次数统计不会被单个长假拉长；
 * 并列时取较小值，让「少量 K 线跨过周末」仍得到日内节奏。
 */
function typicalInterval(data: ReadonlyArray<{ timestamp: number }>): number {
  if (data.length < 2) return 0
  const counts = new Map<number, number>()
  for (let index = 1; index < data.length; index += 1) {
    const diff = data[index]!.timestamp - data[index - 1]!.timestamp
    if (diff > 0) counts.set(diff, (counts.get(diff) ?? 0) + 1)
  }
  let interval = 0
  let occurrences = 0
  for (const [diff, count] of counts) {
    if (count > occurrences || (count === occurrences && diff < interval)) {
      interval = diff
      occurrences = count
    }
  }
  return interval
}

/** 读取序列的常规槽距；同一数据修订的多帧查询共享结果。 */
function resolveCadence(data: ReadonlyArray<{ timestamp: number }>): number {
  const first = data[0]?.timestamp
  const last = data[data.length - 1]?.timestamp
  const cached = cadenceBySeries.get(data)
  if (
    cached !== undefined &&
    cached.first === first &&
    cached.last === last &&
    cached.length === data.length
  )
    return cached.interval
  const interval = typicalInterval(data)
  cadenceBySeries.set(data, { first, last, length: data.length, interval })
  return interval
}

/** 以某个真实节点为原点，按常规槽距偏移若干槽位。 */
function shiftBySlots(origin: number, slots: number, interval: number): number | null {
  return interval > 0 ? finite(origin + slots * interval) : null
}

/** 把时间差换算成槽位数；没有常规槽距时拒绝推算。 */
function slotsBetween(origin: number, timestamp: number, interval: number): number | null {
  return interval > 0 ? finite((timestamp - origin) / interval) : null
}

/**
 * 用一份序列快照构造时间投影。
 *
 * @param data 行情序列；槽距按首尾时间与长度缓存在 WeakMap 上
 * @returns 只读投影；刻度枚举与坐标服务共享同一份外推规则
 */
export function createSeriesTimeProjection(
  data: ReadonlyArray<{ timestamp: number }>,
): TimeProjection {
  const lastIndex = data.length - 1
  const firstTime = data[0]?.timestamp
  const lastTime = data[lastIndex]?.timestamp
  const cadence = resolveCadence(data)

  /** 时间 → 连续槽位；真实行情之间插值，两端按常规槽距外推。 */
  function timeToLogical(timestamp: number): number | null {
    if (!Number.isFinite(timestamp) || firstTime === undefined || lastTime === undefined)
      return null
    if (timestamp < firstTime) return slotsBetween(firstTime, timestamp, cadence)
    if (timestamp > lastTime) {
      const offset = slotsBetween(lastTime, timestamp, cadence)
      return offset === null ? null : finite(lastIndex + offset)
    }
    let low = 0
    let high = lastIndex
    while (low <= high) {
      const middle = (low + high) >> 1
      const value = data[middle]!.timestamp
      if (value === timestamp) return middle
      if (value < timestamp) low = middle + 1
      else high = middle - 1
    }
    const lower = Math.max(0, low - 1)
    const start = data[lower]!.timestamp
    const end = data[lower + 1]!.timestamp
    return end > start ? finite(lower + (timestamp - start) / (end - start)) : null
  }

  /** 连续槽位 → 时间；真实行情之间插值，两端按常规槽距外推。 */
  function logicalToTime(index: number): number | null {
    if (!Number.isFinite(index) || firstTime === undefined || lastTime === undefined) return null
    if (index < 0) return shiftBySlots(firstTime, index, cadence)
    if (index > lastIndex) return shiftBySlots(lastTime, index - lastIndex, cadence)
    if (Number.isInteger(index)) return data[index]!.timestamp
    const lower = Math.floor(index)
    const start = data[lower]!.timestamp
    const end = data[lower + 1]!.timestamp
    return end > start ? finite(start + (end - start) * (index - lower)) : null
  }

  return Object.freeze({ timeToLogical, logicalToTime })
}
