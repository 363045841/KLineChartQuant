/**
 * 一目均衡表指标计算（回测与线上共用的单一实现）。
 *
 * 注意：KCQ 的 SMC 结构尚未实现，第一版用一目均衡表做替身。
 * 本文件是「判定逻辑单一实现」：回测直接调用它，线上判定也应调用同一份代码，
 * 不要为回测另写一套。**#13 正式接入时迁移到 `features/theory/ichimoku`。**
 *
 * 口径（与 temp/ichimoku-filter-eval/evaluate.mjs 完全一致）：
 * - 转换线 tenkan(9) = (9 周期最高 + 9 周期最低) / 2
 * - 基准线 kijun(26) = (26 周期最高 + 26 周期最低) / 2
 * - 先行带 A = (tenkan + kijun) / 2，提前 26 根绘制
 * - 先行带 B = (52 周期最高 + 52 周期最低) / 2，提前 26 根绘制
 * - ATR(14) 用 Wilder 平滑
 * - Regime 方向 = close[i] - close[i-26]（延迟线相对 26 根前收盘的方向）
 */
import type { Candle, IchimokuSeries } from '../types'

/** 转换线周期。 */
export const TENKAN_PERIOD = 9

/** 基准线周期。 */
export const KIJUN_PERIOD = 26

/** 先行带 B 周期。 */
export const SPAN_B_PERIOD = 52

/** 云提前绘制的周期数。 */
export const SPAN_SHIFT = 26

/** ATR 周期。 */
export const ATR_PERIOD = 14

/** Regime 回看周期。 */
export const REGIME_LOOKBACK = 26

/**
 * 区间滚动最大值（含端点）。
 *
 * @param values 序列
 * @param from 起始索引
 * @param to 结束索引
 * @returns 区间最大值
 */
function rollingMax(values: readonly number[], from: number, to: number): number {
  let result = Number.NEGATIVE_INFINITY
  for (let index = from; index <= to; index += 1) {
    const value = values[index]
    if (value > result) result = value
  }
  return result
}

/**
 * 区间滚动最小值（含端点）。
 *
 * @param values 序列
 * @param from 起始索引
 * @param to 结束索引
 * @returns 区间最小值
 */
function rollingMin(values: readonly number[], from: number, to: number): number {
  let result = Number.POSITIVE_INFINITY
  for (let index = from; index <= to; index += 1) {
    const value = values[index]
    if (value < result) result = value
  }
  return result
}

/**
 * 计算一目均衡表指标序列。
 *
 * @param candles 已收盘 K 线（按时间升序）
 * @returns 各指标序列
 */
export function computeIchimoku(candles: readonly Candle[]): IchimokuSeries {
  const length = candles.length
  const high = candles.map((candle) => candle.high)
  const low = candles.map((candle) => candle.low)
  const close = candles.map((candle) => candle.close)

  const tenkan = new Array<number | null>(length).fill(null)
  const kijun = new Array<number | null>(length).fill(null)
  const spanARaw = new Array<number | null>(length).fill(null)
  const spanBRaw = new Array<number | null>(length).fill(null)

  for (let index = 0; index < length; index += 1) {
    if (index >= TENKAN_PERIOD - 1) {
      tenkan[index] =
        (rollingMax(high, index - TENKAN_PERIOD + 1, index) +
          rollingMin(low, index - TENKAN_PERIOD + 1, index)) /
        2
    }
    if (index >= KIJUN_PERIOD - 1) {
      kijun[index] =
        (rollingMax(high, index - KIJUN_PERIOD + 1, index) +
          rollingMin(low, index - KIJUN_PERIOD + 1, index)) /
        2
    }
    if (index >= SPAN_B_PERIOD - 1) {
      spanBRaw[index] =
        (rollingMax(high, index - SPAN_B_PERIOD + 1, index) +
          rollingMin(low, index - SPAN_B_PERIOD + 1, index)) /
        2
    }
    const tenkanValue = tenkan[index]
    const kijunValue = kijun[index]
    if (tenkanValue !== null && kijunValue !== null) {
      spanARaw[index] = (tenkanValue + kijunValue) / 2
    }
  }

  // 云提前 26 根绘制：第 i 根 K 线位置的云由 i-26 的数据算出。
  const spanA = new Array<number | null>(length).fill(null)
  const spanB = new Array<number | null>(length).fill(null)
  for (let index = SPAN_SHIFT; index < length; index += 1) {
    spanA[index] = spanARaw[index - SPAN_SHIFT]
    spanB[index] = spanBRaw[index - SPAN_SHIFT]
  }

  // Wilder ATR(14)
  const trueRange = new Array<number>(length).fill(0)
  for (let index = 0; index < length; index += 1) {
    const previousClose = index === 0 ? close[0] : close[index - 1]
    trueRange[index] = Math.max(
      high[index] - low[index],
      Math.abs(high[index] - previousClose),
      Math.abs(low[index] - previousClose),
    )
  }
  const atr = new Array<number | null>(length).fill(null)
  if (length >= ATR_PERIOD) {
    let sum = 0
    for (let index = 0; index < ATR_PERIOD; index += 1) {
      sum += trueRange[index]
    }
    let previousAtr = sum / ATR_PERIOD
    atr[ATR_PERIOD - 1] = previousAtr
    for (let index = ATR_PERIOD; index < length; index += 1) {
      previousAtr = (previousAtr * (ATR_PERIOD - 1) + trueRange[index]) / ATR_PERIOD
      atr[index] = previousAtr
    }
  }

  // Regime：close[i] - close[i-26]
  const regimeDiff = new Array<number | null>(length).fill(null)
  for (let index = REGIME_LOOKBACK; index < length; index += 1) {
    regimeDiff[index] = close[index] - close[index - REGIME_LOOKBACK]
  }

  return { length, close, tenkan, kijun, spanA, spanB, atr, regimeDiff }
}

/**
 * 取某根 K 线的云上下沿；云未就绪返回 null。
 *
 * @param series 指标序列
 * @param index bar 索引
 * @returns 云上下沿与厚度
 */
export function cloudAt(
  series: IchimokuSeries,
  index: number,
): { top: number; bottom: number; thickness: number } | null {
  const spanA = series.spanA[index]
  const spanB = series.spanB[index]
  if (spanA === null || spanB === null) {
    return null
  }
  const top = Math.max(spanA, spanB)
  const bottom = Math.min(spanA, spanB)
  return { top, bottom, thickness: top - bottom }
}
