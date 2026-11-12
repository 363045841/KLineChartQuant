/**
 * 信号判定（L2）与期权位分级。
 *
 * L2 定义（与 temp/ichimoku-filter-eval/evaluate.mjs 的 L2 完全一致，
 * 交叉验证见 cli 的 crossValidation 输出）：
 * - regime 状态：regimeDiff[i] = close[i] - close[i-26] 与方向一致
 * - 云侧：多头要求 close > max(spanA, spanB)，空头要求 close < min(spanA, spanB)
 * - 触发：转换线(9) 上穿/下穿基准线(26)
 *
 * 注意：KCQ 的 SMC 结构尚未实现，这里是一目均衡表替身；#13 正式接入时
 * 结构判定应迁移到 `features/theory/ichimoku`，回测改为调用同一实现。
 */
import type { Candle, Direction, IchimokuSeries, SignalGrade } from '../types'
import { cloudAt } from './ichimoku'

/** 逐 bar 的判定上下文：仅包含可复用的价格与指标。 */
export interface SignalBarContext {
  /** 收盘价 */
  readonly close: number
  /** 云上沿 */
  readonly cloudTop: number
  /** 云下沿 */
  readonly cloudBottom: number
  /** 云厚 */
  readonly cloudThickness: number
}

/**
 * 判断第 index 根 K 线是否构成 L2 信号。
 *
 * @param candles K 线
 * @param series 指标序列
 * @param index bar 索引
 * @returns 信号方向与云几何；不构成信号返回 null
 */
export function evaluateL2Signal(
  candles: readonly Candle[],
  series: IchimokuSeries,
  index: number,
): (SignalBarContext & { direction: Direction }) | null {
  if (index < 1 || index >= candles.length) {
    return null
  }
  const cloud = cloudAt(series, index)
  if (cloud === null) {
    return null
  }

  const tenkan = series.tenkan[index]
  const kijun = series.kijun[index]
  const tenkanPrev = series.tenkan[index - 1]
  const kijunPrev = series.kijun[index - 1]
  const regimeDiff = series.regimeDiff[index]
  if (
    tenkan === null ||
    kijun === null ||
    tenkanPrev === null ||
    kijunPrev === null ||
    regimeDiff === null ||
    index < 27
  ) {
    return null
  }

  const close = series.close[index]
  const tkUp = tenkan > kijun && tenkanPrev <= kijunPrev
  const tkDown = tenkan < kijun && tenkanPrev >= kijunPrev

  // 多头：regime 向上 + 收盘价在云上方 + 转换线上穿基准线
  if (tkUp && regimeDiff > 0 && close > cloud.top) {
    return {
      direction: 'long',
      close,
      cloudTop: cloud.top,
      cloudBottom: cloud.bottom,
      cloudThickness: cloud.thickness,
    }
  }
  // 空头：regime 向下 + 收盘价在云下方 + 转换线下穿基准线
  if (tkDown && regimeDiff < 0 && close < cloud.bottom) {
    return {
      direction: 'short',
      close,
      cloudTop: cloud.top,
      cloudBottom: cloud.bottom,
      cloudThickness: cloud.thickness,
    }
  }
  return null
}

/**
 * 计算入场价到最近期权关键位的距离。
 *
 * @param price 入场价
 * @param levels 关键位列表
 * @returns 最小距离；空列表返回 Infinity
 */
export function nearestLevelDistance(price: number, levels: readonly number[]): number {
  let best = Number.POSITIVE_INFINITY
  for (const level of levels) {
    const distance = Math.abs(price - level)
    if (distance < best) best = distance
  }
  return best
}

/**
 * 最小止损距离闸门：止损距入场价的比例不足时视为不可开仓。
 *
 * 为什么需要：云边止损的距离可以被压到 0.05% 价格，而成本是按名义金额的固定 bps
 * 计的，折算成 R 就是数倍——这类交易在任何真实成本下都不可做，留着只会污染统计。
 * 闸门只作用于「能否开仓」，不参与信号识别本身。
 *
 * @param entryPrice 入场价（信号 bar 收盘价）
 * @param stopPrice 止损价
 * @param minRatio 最小距离占入场价的比例；0 表示不设限
 * @returns 是否通过闸门
 */
export function meetsMinStopDistance(
  entryPrice: number,
  stopPrice: number,
  minRatio: number,
): boolean {
  if (!(minRatio > 0)) {
    return true
  }
  return Math.abs(entryPrice - stopPrice) / entryPrice >= minRatio
}

/**
 * 期权位分级：A = 距任一关键位 ≤ 0.5 × 云厚；B = 不满足；无期权数据返回 null。
 *
 * @param entryPrice 入场价（信号 bar 收盘价）
 * @param cloudThickness 云厚
 * @param levels as-of 期权关键位；null 表示无覆盖
 * @param toleranceRatio A 级容差系数（默认 0.5）
 * @returns 分级
 */
export function classifyGrade(
  entryPrice: number,
  cloudThickness: number,
  levels: readonly number[] | null,
  toleranceRatio: number,
): SignalGrade {
  if (levels === null || levels.length === 0) {
    return null
  }
  return nearestLevelDistance(entryPrice, levels) <= toleranceRatio * cloudThickness ? 'A' : 'B'
}
