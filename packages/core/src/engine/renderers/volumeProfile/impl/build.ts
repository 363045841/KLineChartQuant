/**
 * 成交量分布聚合：把一段 K 线的成交量按价格区间摊分到等高的价位桶。
 *
 * 口径对齐 TradingView：按每根 K 线的最高价与最低价、按重叠长度把成交量摊给每个桶；
 * 收盘价不低于开盘价记为上涨量，否则记为下跌量。价值区从 POC 向两侧扩张，
 * 每次比较上方两行与下方两行之和，取较大的一侧加入，直到达到目标占比。
 */
import type { KLineData } from '../../../../foundation/types/price.js'
import type { VolumeProfileLevel, VolumeProfileResult } from '../types.js'
import { MAX_PROFILE_ROWS, MIN_PROFILE_ROWS } from '../types.js'

/** 价值区两侧比较时一次纳入的行数。 */
const VALUE_AREA_STEP_ROWS = 2

/** 把成交量加到指定桶的上涨或下跌合计上。 */
function accumulate(
  raw: { up: Float64Array; down: Float64Array },
  index: number,
  volume: number,
  isUp: boolean,
): void {
  if (index < 0 || index >= raw.up.length) return
  if (isUp) raw.up[index] += volume
  else raw.down[index] += volume
}

/** 计算 POC：成交量最大的桶；并列时取更靠下的一侧。 */
function findPointOfControl(totals: Float64Array): number {
  let best = 0
  for (let index = 1; index < totals.length; index += 1) {
    if (totals[index] > totals[best]) best = index
  }
  return best
}

/** 按 TV 规则扩张价值区，返回价值区上下沿所在行。 */
function expandValueArea(
  totals: Float64Array,
  pocIndex: number,
  targetVolume: number,
): { high: number; low: number } {
  let high = pocIndex
  let low = pocIndex
  let covered = totals[pocIndex]
  while (covered < targetVolume && (low > 0 || high < totals.length - 1)) {
    let upperSum = 0
    for (let offset = 1; offset <= VALUE_AREA_STEP_ROWS; offset += 1) {
      const index = high + offset
      if (index < totals.length) upperSum += totals[index]
    }
    let lowerSum = 0
    for (let offset = 1; offset <= VALUE_AREA_STEP_ROWS; offset += 1) {
      const index = low - offset
      if (index >= 0) lowerSum += totals[index]
    }
    if (upperSum === 0 && lowerSum === 0) break
    if (upperSum >= lowerSum) {
      for (let offset = 1; offset <= VALUE_AREA_STEP_ROWS; offset += 1) {
        const index = high + offset
        if (index >= totals.length) continue
        covered += totals[index]
        high = index
      }
    } else {
      for (let offset = 1; offset <= VALUE_AREA_STEP_ROWS; offset += 1) {
        const index = low - offset
        if (index < 0) continue
        covered += totals[index]
        low = index
      }
    }
  }
  return { high, low }
}

/**
 * 聚合一段 K 线的成交量分布。
 *
 * @param bars 升序 K 线序列。
 * @param startIndex 起始下标（含）。
 * @param endIndex 结束下标（含）。
 * @param rowSize 价位桶数量，会被钳制到 `[MIN_PROFILE_ROWS, MAX_PROFILE_ROWS]`。
 * @param valueAreaPercent 价值区占总量百分比，取值 1–100。
 * @returns 聚合结果；数据为空或价格区间退化为 0 时返回 null。
 */
export function buildVolumeProfile(
  bars: ReadonlyArray<KLineData>,
  startIndex: number,
  endIndex: number,
  rowSize: number,
  valueAreaPercent: number,
): VolumeProfileResult | null {
  const from = Math.max(0, startIndex)
  const to = Math.min(bars.length - 1, endIndex)
  if (to < from) return null

  let low = Number.POSITIVE_INFINITY
  let high = Number.NEGATIVE_INFINITY
  for (let index = from; index <= to; index += 1) {
    const bar = bars[index]
    if (bar === undefined) continue
    if (bar.low < low) low = bar.low
    if (bar.high > high) high = bar.high
  }
  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) return null

  const rows = Math.min(MAX_PROFILE_ROWS, Math.max(MIN_PROFILE_ROWS, Math.round(rowSize)))
  const step = (high - low) / rows
  const raw = { up: new Float64Array(rows), down: new Float64Array(rows) }

  for (let index = from; index <= to; index += 1) {
    const bar = bars[index]
    if (bar === undefined) continue
    const rawVolume = bar.volume
    const volume =
      typeof rawVolume === 'number' && Number.isFinite(rawVolume) ? Math.max(0, rawVolume) : 0
    if (volume === 0) continue
    const isUp = bar.close >= bar.open
    const range = bar.high - bar.low
    if (range <= 0) {
      accumulate(raw, Math.floor((bar.close - low) / step), volume, isUp)
      continue
    }
    const firstBucket = Math.max(0, Math.floor((bar.low - low) / step))
    const lastBucket = Math.min(rows - 1, Math.floor((bar.high - low) / step))
    for (let bucket = firstBucket; bucket <= lastBucket; bucket += 1) {
      const bucketLow = low + bucket * step
      const bucketHigh = bucketLow + step
      const overlap = Math.min(bar.high, bucketHigh) - Math.max(bar.low, bucketLow)
      if (overlap <= 0) continue
      accumulate(raw, bucket, (volume * overlap) / range, isUp)
    }
  }

  const levels: VolumeProfileLevel[] = []
  const totals = new Float64Array(rows)
  let maxLevelVolume = 0
  let maxLevelDelta = 0
  let totalVolume = 0
  for (let index = 0; index < rows; index += 1) {
    const upVolume = raw.up[index]
    const downVolume = raw.down[index]
    const total = upVolume + downVolume
    totals[index] = total
    totalVolume += total
    if (total > maxLevelVolume) maxLevelVolume = total
    const delta = Math.abs(upVolume - downVolume)
    if (delta > maxLevelDelta) maxLevelDelta = delta
    levels.push({
      priceLow: low + index * step,
      priceHigh: low + (index + 1) * step,
      upVolume,
      downVolume,
      totalVolume: total,
    })
  }
  if (totalVolume <= 0) return null

  const pocIndex = findPointOfControl(totals)
  const percent = Math.min(100, Math.max(1, valueAreaPercent))
  const area = expandValueArea(totals, pocIndex, (totalVolume * percent) / 100)

  return {
    levels,
    pointOfControl: (levels[pocIndex].priceLow + levels[pocIndex].priceHigh) / 2,
    valueAreaHigh: levels[area.high].priceHigh,
    valueAreaLow: levels[area.low].priceLow,
    maxLevelVolume,
    maxLevelDelta,
    totalVolume,
  }
}
