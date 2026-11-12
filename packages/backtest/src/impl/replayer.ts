/**
 * 时间推进：逐根 bar 产出入场信号，并立即按理论规则结算成交易。
 *
 * 信号源可切换（`config.signalSource`）：
 * - `l2`：一目均衡表替身（TK 交叉 + regime + 云侧），用于验证过滤器与止损口径。
 * - `smc-break`：结构破坏事件（BOS/CHoCH 收盘确认的那根 bar 顺势入场），
 *   用于测量「结构事件本身有没有 alpha」。
 *
 * 两道闸门都只作用于「能否开仓」：
 * - 偏向闸门：信号方向与结构偏向不一致（或偏向未知）→ 不可开仓；
 * - 止损闸门：结构位口径下找不到已确认枢轴，或止损距离过近 → 不可开仓。
 * 被剔除的信号仍写进 `signalDirections`，否则闸门会连带改变持仓期间的失效判定，
 * 不同档位的结果就不可比。
 */
import type { BreakDirection } from '@363045841yyt/klinechart-core/structure'
import { detectBreaks, detectPivots } from '@363045841yyt/klinechart-core/structure'
import type {
  BacktestConfig,
  Candle,
  Direction,
  IchimokuSeries,
  SignalEvent,
  TradeRecord,
} from '../types'
import { isAlignedWithBias } from './bias'
import { classifyGrade, evaluateL2Signal, meetsMinStopDistance } from './evaluator'
import { cloudAt, computeIchimoku } from './ichimoku'
import { type OptionSnapshot, optionLevelsAt } from './loader'
import { settleTheoreticalTrade } from './settle'
import type { StopResolver } from './stop'

/** 一根 bar 上的原始信号（尚未过闸门）。 */
export interface RawSignal {
  readonly direction: Direction
  readonly entryPrice: number
  readonly cloudTop: number
  readonly cloudBottom: number
  readonly cloudThickness: number
}

/** 回放输入。 */
export interface ReplayInput {
  /** 交易对 */
  readonly symbol: string
  /** 已收盘 K 线 */
  readonly candles: readonly Candle[]
  /** 期权快照（按时间升序） */
  readonly snapshots: readonly OptionSnapshot[]
  /** 止损解析器 */
  readonly stopResolver: StopResolver
  /** 逐 bar 结构偏向；`null` 表示本次不启用偏向闸门 */
  readonly biasSeries: readonly (BreakDirection | null)[] | null
  /** 配置 */
  readonly config: BacktestConfig
}

/** 回放结果。 */
export interface ReplayResult {
  /** 通过全部闸门、可开仓的信号 */
  readonly signals: readonly SignalEvent[]
  /** 全部原始信号的方向（闸门前，用于反向失效判定） */
  readonly signalDirections: readonly (Direction | null)[]
  /** 因止损解析失败被剔除的信号数 */
  readonly missedStopSignalCount: number
  /** 因最小止损距离被剔除的信号数 */
  readonly filteredSignalCount: number
  /** 因与结构偏向不一致被剔除的信号数 */
  readonly biasFilteredSignalCount: number
  /** 结算后的交易 */
  readonly trades: readonly TradeRecord[]
}

/**
 * 一目均衡表信号源。
 *
 * @param candles K 线
 * @param series 指标序列
 * @returns 逐 bar 的信号；无信号为 null
 */
function buildL2Signals(candles: readonly Candle[], series: IchimokuSeries): (RawSignal | null)[] {
  const result = new Array<RawSignal | null>(candles.length).fill(null)
  for (let index = 0; index < candles.length; index += 1) {
    const evaluated = evaluateL2Signal(candles, series, index)
    if (evaluated === null) {
      continue
    }
    result[index] = {
      direction: evaluated.direction,
      entryPrice: evaluated.close,
      cloudTop: evaluated.cloudTop,
      cloudBottom: evaluated.cloudBottom,
      cloudThickness: evaluated.cloudThickness,
    }
  }
  return result
}

/**
 * 结构破坏信号源：BOS/CHoCH 收盘确认的那根 bar 顺势入场。
 *
 * 云尚未就绪的早期 bar 直接跳过——这类信号的 A/B 分级无从计算，
 * 而不是拿别的价格冒充云。
 *
 * @param candles K 线
 * @param series 指标序列
 * @param pivotLookback 枢轴窗口
 * @returns 逐 bar 的信号；无信号为 null
 */
function buildSmcSignals(
  candles: readonly Candle[],
  series: IchimokuSeries,
  pivotLookback: number,
  minMarginRatio: number,
): (RawSignal | null)[] {
  const pivots = detectPivots(candles, pivotLookback, 'swing')
  const breaks = detectBreaks(candles, pivots, 'swing')
  const result = new Array<RawSignal | null>(candles.length).fill(null)
  for (const item of breaks) {
    // 力度剪枝：越界幅度不足的破位视为噪声，直接丢弃。
    if (item.marginRatio < minMarginRatio) {
      continue
    }
    const cloud = cloudAt(series, item.barIndex)
    if (cloud === null) {
      continue
    }
    result[item.barIndex] = {
      direction: item.direction === 'up' ? 'long' : 'short',
      entryPrice: item.close,
      cloudTop: cloud.top,
      cloudBottom: cloud.bottom,
      cloudThickness: cloud.thickness,
    }
  }
  return result
}

/**
 * 回放一个交易对。
 *
 * @param input K 线、期权快照、止损解析器、偏向序列与配置
 * @returns 信号、闸门计数与交易
 */
export function replaySymbol(input: ReplayInput): ReplayResult {
  const { candles, snapshots, config, symbol, stopResolver, biasSeries } = input
  const series = computeIchimoku(candles)
  const rawSignals =
    config.signalSource === 'smc-break'
      ? buildSmcSignals(candles, series, config.pivotLookback, config.smcMinMarginRatio)
      : buildL2Signals(candles, series)

  const signalDirections = new Array<Direction | null>(candles.length).fill(null)
  const signals: SignalEvent[] = []
  let missedStopSignalCount = 0
  let filteredSignalCount = 0
  let biasFilteredSignalCount = 0

  for (let index = 0; index < candles.length; index += 1) {
    const raw = rawSignals[index]
    if (raw === null) {
      continue
    }
    // 先登记方向（所有原始信号都算），再按可交易性决定是否开仓。
    signalDirections[index] = raw.direction
    // 偏向闸门排在止损之前：偏向不对的样本连止损都不必解析。
    if (biasSeries !== null && !isAlignedWithBias(biasSeries[index], raw.direction)) {
      biasFilteredSignalCount += 1
      continue
    }
    const stopPrice = stopResolver({
      barIndex: index,
      direction: raw.direction,
      entryPrice: raw.entryPrice,
      cloudTop: raw.cloudTop,
      cloudBottom: raw.cloudBottom,
    })
    if (stopPrice === null) {
      missedStopSignalCount += 1
      continue
    }
    if (!meetsMinStopDistance(raw.entryPrice, stopPrice, config.minStopDistanceRatio)) {
      filteredSignalCount += 1
      continue
    }
    const bar = candles[index]
    const levels = optionLevelsAt(snapshots, bar.closeTime)
    const grade = classifyGrade(
      raw.entryPrice,
      raw.cloudThickness,
      levels,
      config.cloudToleranceRatio,
    )
    signals.push({
      barIndex: index,
      time: bar.closeTime,
      direction: raw.direction,
      entryPrice: raw.entryPrice,
      stopPrice,
      cloudTop: raw.cloudTop,
      cloudBottom: raw.cloudBottom,
      cloudThickness: raw.cloudThickness,
      optionLevels: levels,
      grade,
    })
  }

  const trades: TradeRecord[] = signals.map((signal, order) =>
    settleTheoreticalTrade({
      symbol,
      id: order + 1,
      candles,
      signal,
      signalDirections,
      config,
    }),
  )

  return {
    signals,
    signalDirections,
    missedStopSignalCount,
    filteredSignalCount,
    biasFilteredSignalCount,
    trades,
  }
}
