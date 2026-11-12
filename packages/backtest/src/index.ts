/**
 * KCQ 回测引擎（第一版）对外导出。
 *
 * 关键约束：信号判定是一目均衡表的**单一实现**（`impl/ichimoku.ts` + `impl/evaluator.ts`），
 * 回测直接调用；线上判定也应复用它，不要另写一套。
 * 第一版的一目计算暂放本包，**#13 正式接入时迁移到 `features/theory/ichimoku`**。
 */

export {
  costRForPrices,
  costRPerBps,
  DEFAULT_COST_BPS_PER_SIDE,
  DEFAULT_COST_SENSITIVITY_BPS,
  projectTradeCost,
} from './impl/cost'
export {
  classifyGrade,
  evaluateL2Signal,
  meetsMinStopDistance,
  nearestLevelDistance,
  type SignalBarContext,
} from './impl/evaluator'
export {
  ATR_PERIOD,
  cloudAt,
  computeIchimoku,
  KIJUN_PERIOD,
  REGIME_LOOKBACK,
  SPAN_B_PERIOD,
  SPAN_SHIFT,
  TENKAN_PERIOD,
} from './impl/ichimoku'

export {
  fetchCandles,
  INTERVAL_MS,
  loadCandlesFromCache,
  loadOptionSnapshots,
  OPTION_LOOKBACK_MS,
  type OptionSnapshot,
  optionLevelsAt,
} from './impl/loader'

export { type ReplayInput, type ReplayResult, replaySymbol } from './impl/replayer'
export { writeReports } from './impl/report'
export { type SettleInput, settleTheoreticalTrade } from './impl/settle'
export {
  annualize,
  computeBuyHold,
  computeCostSensitivity,
  computeRandomBenchmark,
  computeStats,
  groupByGrade,
  type RandomBenchmarkInput,
} from './impl/stats'
export type {
  BacktestConfig,
  BacktestReport,
  BuyHoldBenchmark,
  Candle,
  CostSensitivity,
  CostSensitivityPoint,
  CrossValidation,
  Direction,
  IchimokuSeries,
  PerformanceStats,
  RandomEntryBenchmark,
  SignalEvent,
  SignalGrade,
  SymbolBacktestResult,
  TradeOutcome,
  TradeRecord,
} from './types'
