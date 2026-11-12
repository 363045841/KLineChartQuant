/**
 * 多周期对齐：把 LTF bar 聚合成 HTF bar，并把 HTF 的结构偏向因果地映射回 LTF 索引。
 *
 * 这里最容易犯的错是**用未收盘的 HTF bar**：1h 图上 10:00 这一刻，当天的日线还没有走完，
 * 用它的开高低收就是拿未来数据。本模块只用「已经收盘」的 HTF bar——
 * 判据是 `htfBar.closeTime <= ltfBar.closeTime`。
 */

import type { HtfTimeframe } from '../types'

/** HTF 周期对应的毫秒数。 */
const HTF_MS: Readonly<Record<HtfTimeframe, number>> = {
  '4h': 14_400_000,
  '1d': 86_400_000,
}

/** 聚合后的 HTF bar。 */
export interface AggregateBar {
  readonly openTime: number
  readonly closeTime: number
  readonly open: number
  readonly high: number
  readonly low: number
  readonly close: number
}

/** 聚合所需的 LTF bar 形状。 */
export interface SourceBar {
  readonly openTime: number
  readonly closeTime: number
  readonly open: number
  readonly high: number
  readonly low: number
  readonly close: number
}

/**
 * 把 LTF bar 聚合成 HTF bar（按 UTC 对齐的分桶，不跨桶拼接）。
 *
 * @param candles LTF bar，按时间升序
 * @param timeframe 目标周期
 * @returns 按时间升序的 HTF bar
 */
export function aggregateCandles(
  candles: readonly SourceBar[],
  timeframe: HtfTimeframe,
): AggregateBar[] {
  const period = HTF_MS[timeframe]
  const result: AggregateBar[] = []
  let currentStart = Number.NaN
  let bucket: { open: number; high: number; low: number; close: number } | null = null

  const flush = (): void => {
    if (bucket === null) {
      return
    }
    result.push({
      openTime: currentStart,
      closeTime: currentStart + period - 1,
      open: bucket.open,
      high: bucket.high,
      low: bucket.low,
      close: bucket.close,
    })
  }

  for (const candle of candles) {
    const bucketStart = Math.floor(candle.openTime / period) * period
    if (bucketStart !== currentStart) {
      flush()
      currentStart = bucketStart
      bucket = { open: candle.open, high: candle.high, low: candle.low, close: candle.close }
      continue
    }
    if (bucket === null) {
      continue
    }
    if (candle.high > bucket.high) bucket.high = candle.high
    if (candle.low < bucket.low) bucket.low = candle.low
    bucket.close = candle.close
  }
  flush()
  return result
}

/**
 * 取「在给定时刻已经收盘」的 HTF bar 下标。
 *
 * @param htfBars 按时间升序的 HTF bar
 * @param closeTime 参考收盘时刻
 * @returns 下标；没有已收盘 HTF bar 时为 -1
 */
export function lastClosedIndex(htfBars: readonly AggregateBar[], closeTime: number): number {
  let low = 0
  let high = htfBars.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (htfBars[middle].closeTime <= closeTime) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found
}
