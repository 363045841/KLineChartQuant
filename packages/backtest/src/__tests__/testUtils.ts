/**
 * 回测单元测试公共工具：K 线、交易、配置构造器。
 */

import type {
  BacktestConfig,
  Candle,
  HtfTimeframe,
  PerformanceStats,
  SignalGrade,
  SignalSource,
  StopSource,
  TradeOutcome,
  TradeRecord,
} from '../types'

/** 1 小时的毫秒数。 */
export const HOUR_MS = 3_600_000

/** 测试基准时刻：2026-11-01T00:00:00Z。 */
export const BASE_TIME = Date.UTC(2026, 10, 1, 0, 0, 0)

/**
 * 构造一根 K 线。
 *
 * @param openTime 开盘时刻
 * @param ohlc 价格
 * @returns K 线
 */
export function makeCandle(
  openTime: number,
  ohlc: { open: number; high: number; low: number; close: number },
): Candle {
  return {
    openTime,
    closeTime: openTime + HOUR_MS - 1,
    open: ohlc.open,
    high: ohlc.high,
    low: ohlc.low,
    close: ohlc.close,
    volume: 1,
  }
}

/** 交易构造参数。 */
export interface TradeParams {
  /** 编号 */
  readonly id: number
  /** 净 R 盈亏（扣成本后的记录值） */
  readonly rMultiple: number
  /** 未扣成本的 R（缺省等于 rMultiple） */
  readonly grossR?: number
  /** 成本（R 单位，缺省 0） */
  readonly costR?: number
  /** 入场时刻 */
  readonly entryTime: number
  /** 交易对 */
  readonly symbol?: string
  /** 持仓 bar 数 */
  readonly barsHeld?: number
  /** 分级 */
  readonly grade?: SignalGrade
  /** 结局 */
  readonly outcome?: TradeOutcome
}

/**
 * 构造一笔交易记录。
 *
 * 出场价由毛 R 反推（`100 + grossR * 5`），保证成本与价格一致可复算。
 *
 * @param params 差异项
 * @returns 交易记录
 */
export function makeTrade(params: TradeParams): TradeRecord {
  const barsHeld = params.barsHeld ?? 1
  const grossR = params.grossR ?? params.rMultiple
  return {
    id: params.id,
    symbol: params.symbol ?? 'BTCUSDT',
    direction: 'long',
    grade: params.grade ?? null,
    signalIndex: 0,
    entryIndex: 0,
    exitIndex: barsHeld,
    entryTime: params.entryTime,
    exitTime: params.entryTime + barsHeld * HOUR_MS,
    entryPrice: 100,
    stopPrice: 95,
    target1: 110,
    target2: 115,
    riskPerUnit: 5,
    exitPrice: 100 + grossR * 5,
    outcome: params.outcome ?? 'hit_target',
    grossR,
    costR: params.costR ?? 0,
    rMultiple: params.rMultiple,
    barsHeld,
    maxFavorableR: Math.max(grossR, 0),
    maxAdverseR: 0,
    reachedTarget2: false,
    managedOutcome: null,
  }
}

/** 配置构造参数。 */
export interface ConfigParams {
  /** 最长持仓 bar 数 */
  readonly maxBars?: number
  /** 第一目标 */
  readonly target1R?: number
  /** 第二目标 */
  readonly target2R?: number
  /** 随机采样数 */
  readonly randomSamples?: number
  /** 随机种子 */
  readonly seed?: number
  /** 单边成本（bps） */
  readonly costBpsPerSide?: number
  /** 最小止损距离比例 */
  readonly minStopDistanceRatio?: number
  /** 止损来源 */
  readonly stopSource?: StopSource
  /** 结构止损枢轴窗口 */
  readonly pivotLookback?: number
  /** 是否要求偏向一致 */
  readonly requireBiasAgreement?: boolean
  /** 高周期 */
  readonly htfTimeframe?: HtfTimeframe | null
  /** 高周期枢轴窗口 */
  readonly htfLookback?: number
  /** 入场信号源 */
  readonly signalSource?: SignalSource
  /** 结构破位最小力度 */
  readonly smcMinMarginRatio?: number
}

/**
 * 构造回测配置。
 *
 * @param params 差异项
 * @returns 配置
 */
export function makeConfig(params: ConfigParams = {}): BacktestConfig {
  return {
    symbols: ['BTCUSDT'],
    timeframe: '1h',
    target1R: params.target1R ?? 2,
    target2R: params.target2R ?? 3,
    maxBars: params.maxBars ?? 200,
    cloudToleranceRatio: 0.5,
    minStopDistanceRatio: params.minStopDistanceRatio ?? 0,
    stopSource: params.stopSource ?? 'cloud',
    pivotLookback: params.pivotLookback ?? 3,
    requireBiasAgreement: params.requireBiasAgreement ?? false,
    htfTimeframe: params.htfTimeframe ?? null,
    htfLookback: params.htfLookback ?? 3,
    signalSource: params.signalSource ?? 'l2',
    smcMinMarginRatio: params.smcMinMarginRatio ?? 0,
    costBpsPerSide: params.costBpsPerSide ?? 0,
    randomSeed: params.seed ?? 42,
    randomSamples: params.randomSamples ?? 100,
    klinesCacheDir: 'cache',
    optionRoot: 'options',
    outDir: 'out',
  }
}

/** 空统计（用于断言无交易场景）。 */
export const EMPTY_STATS: PerformanceStats = {
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
