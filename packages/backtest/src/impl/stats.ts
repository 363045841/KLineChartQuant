/**
 * 绩效指标与基准。
 *
 * 主指标是期望值（每笔平均 R）——#5 定案的核心口径；辅助指标包括 PF、胜率、
 * 最大回撤（R 曲线）、交易笔数与平均持仓 bar 数。
 * 基准两类：随机入场（同方向同频率）、买入持有。
 */
import type { BreakDirection } from '@363045841yyt/klinechart-core/structure'
import type {
  BacktestConfig,
  BuyHoldBenchmark,
  Candle,
  CostSensitivity,
  Direction,
  IchimokuSeries,
  PerformanceStats,
  RandomEntryBenchmark,
  SignalEvent,
  TradeRecord,
} from '../types'
import { isAlignedWithBias } from './bias'
import { costRPerBps, DEFAULT_COST_SENSITIVITY_BPS, projectTradeCost } from './cost'
import { meetsMinStopDistance } from './evaluator'
import { cloudAt } from './ichimoku'
import { settleTheoreticalTrade } from './settle'
import type { StopResolver } from './stop'

/** 一年毫秒数（按 365 天折算年化）。 */
const YEAR_MS = 365 * 86_400_000

/** 打平阈值：R 绝对值不超过该值视为打平。 */
const FLAT_R = 1e-9

/** 空统计（无交易时的稳定返回值）。 */
const EMPTY_STATS: PerformanceStats = {
  trades: 0,
  expectancyR: 0,
  expectancyGrossR: 0,
  totalR: 0,
  totalGrossR: 0,
  profitFactor: null,
  winRate: null,
  maxDrawdownR: 0,
  avgBarsHeld: 0,
  medianBarsHeld: 0,
  wins: 0,
  losses: 0,
  breakeven: 0,
  avgWinR: null,
  avgLossR: null,
}

/**
 * 中位数。
 *
 * @param values 数值
 * @returns 中位数；空数组返回 0
 */
function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

/**
 * 统计一组交易。
 *
 * @param trades 交易
 * @returns 绩效指标
 */
export function computeStats(trades: readonly TradeRecord[]): PerformanceStats {
  if (trades.length === 0) {
    return EMPTY_STATS
  }
  // 按入场时间排序，保证回撤曲线的时间顺序。
  const ordered = [...trades].sort(
    (left, right) => left.entryTime - right.entryTime || left.id - right.id,
  )

  let wins = 0
  let losses = 0
  let breakeven = 0
  let grossWin = 0
  let grossLoss = 0
  let totalR = 0
  let totalGrossR = 0
  let barsSum = 0

  for (const trade of ordered) {
    totalR += trade.rMultiple
    totalGrossR += trade.grossR
    barsSum += trade.barsHeld
    if (trade.rMultiple > FLAT_R) {
      wins += 1
      grossWin += trade.rMultiple
    } else if (trade.rMultiple < -FLAT_R) {
      losses += 1
      grossLoss += -trade.rMultiple
    } else {
      breakeven += 1
    }
  }

  // 最大回撤：以 0 为起点的累计 R 曲线，峰谷差。
  let equity = 0
  let peak = 0
  let maxDrawdownR = 0
  for (const trade of ordered) {
    equity += trade.rMultiple
    if (equity > peak) peak = equity
    const drawdown = peak - equity
    if (drawdown > maxDrawdownR) maxDrawdownR = drawdown
  }

  return {
    trades: ordered.length,
    expectancyR: totalR / ordered.length,
    expectancyGrossR: totalGrossR / ordered.length,
    totalR,
    totalGrossR,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    winRate: wins / ordered.length,
    maxDrawdownR,
    avgBarsHeld: barsSum / ordered.length,
    medianBarsHeld: median(ordered.map((trade) => trade.barsHeld)),
    wins,
    losses,
    breakeven,
    avgWinR: wins > 0 ? grossWin / wins : null,
    avgLossR: losses > 0 ? grossLoss / losses : null,
  }
}

/**
 * 买入持有基准。
 *
 * @param symbol 交易对
 * @param candles K 线
 * @returns 基准指标
 */
export function computeBuyHold(symbol: string, candles: readonly Candle[]): BuyHoldBenchmark {
  const first = candles[0]
  const last = candles[candles.length - 1]
  const startPrice = first.close
  const endPrice = last.close
  const days = (last.closeTime - first.openTime) / 86_400_000
  const totalReturn = endPrice / startPrice - 1
  return {
    symbol,
    startPrice,
    endPrice,
    totalReturn,
    cagr: annualize(totalReturn, days),
    days,
    startTime: first.openTime,
    endTime: last.closeTime,
  }
}

/**
 * 确定性伪随机数（mulberry32）：保证随机基准可复现。
 *
 * @param seed 种子
 * @returns 返回 [0,1) 的生成器
 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** 随机入场基准输入。 */
export interface RandomBenchmarkInput {
  /** 交易对 */
  readonly symbol: string
  /** K 线 */
  readonly candles: readonly Candle[]
  /** 指标序列 */
  readonly series: IchimokuSeries
  /** 真实信号方向（用于失效规则对齐） */
  readonly signalDirections: readonly (Direction | null)[]
  /** 真实信号的多头比例 */
  readonly longRatio: number
  /** 配置 */
  readonly config: BacktestConfig
  /** 止损解析器；随机基准必须与真实信号用同一套止损规则 */
  readonly stopResolver: StopResolver
  /** 逐 bar 结构偏向；`null` 表示不启用偏向闸门 */
  readonly biasSeries: readonly (BreakDirection | null)[] | null
}

/**
 * 随机入场基准：同方向比例、同结算规则，检验 L2 是否优于随机时机。
 *
 * @param input K 线、指标、信号方向与配置
 * @returns 随机基准统计
 */
export function computeRandomBenchmark(input: RandomBenchmarkInput): RandomEntryBenchmark {
  const { candles, series, signalDirections, longRatio, config, symbol, stopResolver, biasSeries } =
    input
  const random = createRandom(config.randomSeed)

  const longEligible: number[] = []
  const shortEligible: number[] = []
  for (let index = 28; index < candles.length - 1; index += 1) {
    const cloud = cloudAt(series, index)
    if (cloud === null) continue
    const close = candles[index].close
    if (close > cloud.top) longEligible.push(index)
    if (close < cloud.bottom) shortEligible.push(index)
  }

  const trades: TradeRecord[] = []
  for (let sample = 0; sample < config.randomSamples; sample += 1) {
    const direction: Direction = random() < longRatio ? 'long' : 'short'
    const pool = direction === 'long' ? longEligible : shortEligible
    if (pool.length === 0) continue
    const index = pool[Math.floor(random() * pool.length)]
    // 随机基准必须与真实信号过同一道偏向闸门，否则两组期望不可比。
    if (biasSeries !== null && !isAlignedWithBias(biasSeries[index], direction)) continue
    const cloud = cloudAt(series, index)
    if (cloud === null) continue
    const close = candles[index].close
    const stopPrice = stopResolver({
      barIndex: index,
      direction,
      entryPrice: close,
      cloudTop: cloud.top,
      cloudBottom: cloud.bottom,
    })
    // 随机基准必须与真实信号用同一套止损规则与同一道闸门，否则两组期望不可比。
    if (stopPrice === null) continue
    if (!meetsMinStopDistance(close, stopPrice, config.minStopDistanceRatio)) continue
    const signal: SignalEvent = {
      barIndex: index,
      time: candles[index].closeTime,
      direction,
      entryPrice: close,
      stopPrice,
      cloudTop: cloud.top,
      cloudBottom: cloud.bottom,
      cloudThickness: cloud.thickness,
      optionLevels: null,
      grade: null,
    }
    trades.push(
      settleTheoreticalTrade({
        symbol,
        id: sample + 1,
        candles,
        signal,
        signalDirections,
        config,
      }),
    )
  }

  return {
    symbol,
    samples: trades.length,
    longRatio,
    stats: computeStats(trades),
  }
}

/**
 * 按 A/B 分组统计。
 *
 * @param trades 交易
 * @returns A 与 B 两组统计（无分级的交易不计入）
 */
export function groupByGrade(trades: readonly TradeRecord[]): Record<'A' | 'B', PerformanceStats> {
  return {
    A: computeStats(trades.filter((trade) => trade.grade === 'A')),
    B: computeStats(trades.filter((trade) => trade.grade === 'B')),
  }
}

/**
 * 成本敏感度：按多个「单边成本」档位重算绩效。
 *
 * 为什么可以精确重算而不是线性近似：`costR` 对 bps 是线性的，且结局
 * （是否触及止损/目标）不随成本变化，所以每个档位只需重算 R 记账。
 *
 * @param trades 交易（用各笔的 grossR 与成本系数）
 * @param levels 单边成本档位（bps）
 * @returns 各档位绩效 + 盈亏平衡成本
 */
export function computeCostSensitivity(
  trades: readonly TradeRecord[],
  levels: readonly number[] = DEFAULT_COST_SENSITIVITY_BPS,
): CostSensitivity {
  const points = levels.map((costBpsPerSide) => {
    const stats = computeStats(trades.map((trade) => projectTradeCost(trade, costBpsPerSide)))
    return {
      costBpsPerSide,
      expectancyR: stats.expectancyR,
      totalR: stats.totalR,
      profitFactor: stats.profitFactor,
      winRate: stats.winRate,
    }
  })

  const costRPerBpsMean =
    trades.length === 0
      ? 0
      : trades.reduce(
          (sum, trade) => sum + costRPerBps(trade.entryPrice, trade.exitPrice, trade.riskPerUnit),
          0,
        ) / trades.length
  const gross = computeStats(trades)
  // 期望值对 bps 线性，故盈亏平衡点可由「未扣成本期望 ÷ 每 bp 成本系数」直接解出。
  const breakevenBpsPerSide =
    costRPerBpsMean > 0 && gross.expectancyGrossR > 0
      ? gross.expectancyGrossR / costRPerBpsMean
      : null

  return { levels: points, breakevenBpsPerSide, costRPerBps: costRPerBpsMean }
}

/**
 * 计算年化收益（供报告展示）。
 *
 * @param totalReturn 总收益率
 * @param days 天数
 * @returns 年化收益率
 */
export function annualize(totalReturn: number, days: number): number {
  const years = (days * 86_400_000) / YEAR_MS
  return years > 0 ? (1 + totalReturn) ** (1 / years) - 1 : 0
}
