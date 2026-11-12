/**
 * 结构偏向序列：把 BOS/CHoCH 事件摊平成「每根 bar 当时的结构偏向」，并支持多周期取交集。
 *
 * 因果口径：
 * - LTF 偏向：第 i 根 bar 的偏向 = 最近一次 `barIndex <= i` 的 LTF 破位方向。
 *   破位在该 bar 收盘确认，信号也在同一收盘评估，两者同时可知。
 * - HTF 偏向：只用**已收盘**的 HTF bar（`htfBar.closeTime <= ltfBar.closeTime`）。
 *   1h 图上午 10 点那一刻，当天日线还没走完，绝不能拿它的高低收。
 */
import {
  BREAK_DIRECTION,
  type BreakDirection,
  detectBreaks,
  detectPivots,
  type PivotScale,
} from '@363045841yyt/klinechart-core/structure'
import type { Candle, HtfTimeframe } from '../types'
import { aggregateCandles, lastClosedIndex, type SourceBar } from './resample'

/**
 * 在一段 bar 上构建逐 bar 的偏向序列。
 *
 * @param bars 已收盘 bar（LTF 或 HTF）
 * @param pivotLookback 枢轴窗口
 * @param scale 枢轴级别
 * @returns 每根 bar 的偏向；`null` 表示到该根为止还没有出现过破位
 */
function biasOnBars(
  bars: readonly SourceBar[],
  pivotLookback: number,
  scale: PivotScale,
): (BreakDirection | null)[] {
  const pivots = detectPivots(bars, pivotLookback, scale)
  const breaks = detectBreaks(bars, pivots, scale)
  const series = new Array<BreakDirection | null>(bars.length).fill(null)
  let cursor = 0
  let current: BreakDirection | null = null
  for (let index = 0; index < bars.length; index += 1) {
    while (cursor < breaks.length && breaks[cursor].barIndex <= index) {
      current = breaks[cursor].direction
      cursor += 1
    }
    series[index] = current
  }
  return series
}

/**
 * LTF 偏向序列。
 *
 * @param candles 已收盘 LTF K 线
 * @param pivotLookback 枢轴窗口
 * @returns 每根 LTF bar 的偏向
 */
export function buildBiasSeries(
  candles: readonly Candle[],
  pivotLookback: number,
): (BreakDirection | null)[] {
  return biasOnBars(candles, pivotLookback, 'swing')
}

/**
 * 把 HTF 偏向映射到每一根 LTF bar 上（只用已收盘的 HTF bar）。
 *
 * @param candles 已收盘 LTF K 线
 * @param htf 目标 HTF 周期
 * @param htfLookback HTF 上的枢轴窗口
 * @returns 每根 LTF bar 看到的 HTF 偏向
 */
export function buildHtfBiasSeries(
  candles: readonly Candle[],
  htf: HtfTimeframe,
  htfLookback: number,
): (BreakDirection | null)[] {
  const htfBars = aggregateCandles(candles, htf)
  const htfBias = biasOnBars(htfBars, htfLookback, 'swing')
  const series = new Array<BreakDirection | null>(candles.length).fill(null)
  for (let index = 0; index < candles.length; index += 1) {
    const closed = lastClosedIndex(htfBars, candles[index].closeTime)
    series[index] = closed < 0 ? null : htfBias[closed]
  }
  return series
}

/**
 * 多周期偏向取交集：只有全部周期同向时才给出该方向，否则为 null（未知或矛盾）。
 *
 * @param series 各周期的偏向序列（长度一致）
 * @returns 合并后的偏向序列
 * @throws Error 序列长度不一致
 */
export function intersectBias(
  series: readonly (readonly (BreakDirection | null)[])[],
): (BreakDirection | null)[] {
  if (series.length === 0) {
    throw new Error('至少需要一个周期的偏向序列')
  }
  const length = series[0].length
  for (const item of series) {
    if (item.length !== length) {
      throw new Error('多周期偏向序列长度不一致')
    }
  }
  const result = new Array<BreakDirection | null>(length).fill(null)
  for (let index = 0; index < length; index += 1) {
    const first = series[0][index]
    if (first === null) {
      continue
    }
    let agreed = true
    for (let order = 1; order < series.length; order += 1) {
      if (series[order][index] !== first) {
        agreed = false
        break
      }
    }
    result[index] = agreed ? first : null
  }
  return result
}

/**
 * 判断信号方向是否与结构偏向一致。
 *
 * @param bias 该 bar 的结构偏向
 * @param direction 信号方向
 * @returns 是否同向；偏向未知时返回 false（未知不等于一致）
 */
export function isAlignedWithBias(
  bias: BreakDirection | null,
  direction: 'long' | 'short',
): boolean {
  if (bias === BREAK_DIRECTION.up) {
    return direction === 'long'
  }
  if (bias === BREAK_DIRECTION.down) {
    return direction === 'short'
  }
  return false
}
