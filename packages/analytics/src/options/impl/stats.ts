/**
 * 期权波动统计：把日级（或小时级）样本算成 IV Rank、IV Percentile、RV20 与 VRP。
 *
 * 纯函数，不碰存储与时钟；样本由调用方按层读好再传进来。口径全部集中在本文件：
 * - IV Rank = (最新 − 窗口最低) / (窗口最高 − 窗口最低) × 100
 * - IV Percentile = 窗口内严格低于最新值的样本占比
 * - RV20 = 20 个对数收益的标准差 × √365 × 100（加密 7×24 交易，用日历天）
 * - VRP = 最新平值 IV − RV20
 *
 * 分位在样本天数不足 5 天时返回 null：两点算分位没有意义，给数字只会误导。
 */
import type {
  OptionStatsSource,
  OptionTermPoint,
  OptionVolatilityStats,
  OptionWindowStats,
} from '../types'

/** 一天的毫秒数。 */
const DAY_MS = 86_400_000

/** 分位允许出数的最小样本天数。 */
export const OPTION_STATS_MIN_SAMPLE_DAYS = 5

/** 默认统计窗口：一个月、一个季度、一年。 */
export const OPTION_STATS_DEFAULT_WINDOWS: readonly number[] = [30, 90, 365]

/** 已实现波动率的收益个数。 */
export const OPTION_RV_WINDOW = 20

/** 加密一年按 365 天折算年化。 */
const ANNUALIZATION_DAYS = 365

/** 日行为样本源时，最新样本超过 26 小时视为过期（采集与滚上各留余量）。 */
const DAILY_STALE_MS = 26 * 3_600_000

/** 小时行为样本源时，最新样本超过 3 小时视为过期。 */
const HOURLY_STALE_MS = 3 * 3_600_000

/** 一个统计样本：一天一个点。 */
export interface OptionStatSample {
  /** UTC 日期 `YYYY-MM-DD` */
  readonly day: string
  /** 该样本的采集时刻（毫秒） */
  readonly capturedAt: number
  /** 平值隐含波动率（百分数）；缺失为 null */
  readonly atmIvPercent: number | null
  /** 现货指数；缺失为 null，RV 只用非空样本 */
  readonly spotIndex: number | null
}

/** 最新样本行带的期限结构与偏斜。 */
export interface OptionStatsStructure {
  /** 逐到期 ATM IV，按到期升序 */
  readonly expiries: readonly OptionTermPoint[]
  /** 25Δ 风险逆转（波动点） */
  readonly skew25dVolPoints: number | null
  /** 25Δ 偏斜使用的到期日 */
  readonly skew25dExpiryIso: string | null
}

/** 统计请求。 */
export interface OptionStatsRequest {
  /** 样本（顺序不限） */
  readonly samples: readonly OptionStatSample[]
  /** 请求的窗口天数 */
  readonly windows: readonly number[]
  /** 样本来源层 */
  readonly source: OptionStatsSource
  /** 当前毫秒 */
  readonly now: number
  /**
   * 最新样本行的期限结构与偏斜；该行没有这些字段（schema 2 及更早）时省略。
   * 结构跟着样本行走，不和分位各自找一份时间基准。
   */
  readonly structure?: OptionStatsStructure | null
}

/**
 * 算 IV Rank。
 *
 * @param latest 最新值
 * @param high 窗口最高
 * @param low 窗口最低
 * @returns 0–100 的百分数；高低相同或任一缺失时返回 null
 */
export function ivRankOf(
  latest: number | null,
  high: number | null,
  low: number | null,
): number | null {
  if (latest === null || high === null || low === null) return null
  if (high <= low) return null
  return ((latest - low) / (high - low)) * 100
}

/**
 * 算 IV Percentile：严格低于最新值的样本占比。
 *
 * 用严格小于而不是小于等于：样本完全相同（全天 IV 不动）时结果应为 0，而不是 50 或 100。
 *
 * @param values 窗口内的样本值
 * @param latest 最新值
 * @returns 0–100 的百分数；没有样本或最新值为 null 时返回 null
 */
export function ivPercentileOf(values: readonly number[], latest: number | null): number | null {
  if (latest === null || values.length === 0) return null
  let below = 0
  for (const value of values) {
    if (value < latest) below += 1
  }
  return (below / values.length) * 100
}

/**
 * 算年化已实现波动率。
 *
 * @param closes 按时间升序的收盘价（至少 window + 1 个）
 * @param window 收益个数
 * @returns 年化百分数；样本不足或任一对数收益非法时返回 null
 */
export function realizedVolatilityOf(
  closes: readonly number[],
  window: number = OPTION_RV_WINDOW,
): number | null {
  if (closes.length < window + 1) return null
  const sample = closes.slice(-(window + 1))
  const returns: number[] = []
  for (let index = 1; index < sample.length; index += 1) {
    const previous = sample[index - 1]
    const current = sample[index]
    if (previous === undefined || current === undefined || previous <= 0 || current <= 0)
      return null
    returns.push(Math.log(current / previous))
  }
  if (returns.length < 2) return null
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1)
  return Math.sqrt(variance) * Math.sqrt(ANNUALIZATION_DAYS) * 100
}

/**
 * 取样本的来源过期阈值。
 *
 * @param source 来源层
 * @returns 毫秒；无样本来源时为 null
 */
function staleThresholdOf(source: OptionStatsSource): number | null {
  if (source === 'daily') return DAILY_STALE_MS
  if (source === 'hourly') return HOURLY_STALE_MS
  return null
}

/**
 * 算一个窗口的统计。
 *
 * @param samples 已按日期升序的样本
 * @param windowDays 窗口天数
 * @returns 窗口统计
 */
function windowStatsOf(
  samples: readonly OptionStatSample[],
  windowDays: number,
): OptionWindowStats {
  const latest = samples[samples.length - 1]
  const latestDayMs = latest === undefined ? Number.NaN : Date.parse(latest.day)
  const values: number[] = []
  if (Number.isFinite(latestDayMs)) {
    const startMs = latestDayMs - (windowDays - 1) * DAY_MS
    for (const sample of samples) {
      const dayMs = Date.parse(sample.day)
      if (!Number.isFinite(dayMs) || dayMs < startMs) continue
      if (sample.atmIvPercent !== null) values.push(sample.atmIvPercent)
    }
  }
  const sampleDays = values.length
  const ivLatest = values.length === 0 ? null : (values[values.length - 1] ?? null)
  const ivHigh = values.length === 0 ? null : Math.max(...values)
  const ivLow = values.length === 0 ? null : Math.min(...values)
  const enough = sampleDays >= OPTION_STATS_MIN_SAMPLE_DAYS
  return {
    windowDays,
    sampleDays,
    expectedDays: windowDays,
    ivLatest,
    ivHigh,
    ivLow,
    ivRank: enough ? ivRankOf(ivLatest, ivHigh, ivLow) : null,
    ivPercentile: enough ? ivPercentileOf(values, ivLatest) : null,
  }
}

/**
 * 计算一次波动统计。
 *
 * @param request 样本、窗口、来源与时钟
 * @returns 统计结果；没有样本时各字段为 null、`source` 原样带回
 */
export function computeOptionStats(request: OptionStatsRequest): OptionVolatilityStats {
  const ordered = [...request.samples].sort(
    (left, right) => left.day.localeCompare(right.day) || left.capturedAt - right.capturedAt,
  )
  const latest = ordered[ordered.length - 1]
  const latestIv = (() => {
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      const value = ordered[index]?.atmIvPercent
      if (value !== null && value !== undefined) return value
    }
    return null
  })()
  const closes = ordered
    .map((sample) => sample.spotIndex)
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0)
  const rv20 = realizedVolatilityOf(closes, OPTION_RV_WINDOW)
  const staleMs = staleThresholdOf(request.source)
  const structure = request.structure ?? null
  const termStructure =
    structure === null || structure.expiries.length === 0 ? null : structure.expiries
  if (latest === undefined || staleMs === null) {
    return {
      source: request.source,
      stale: true,
      latestCapturedAt: null,
      rv20,
      vrp: null,
      termStructure,
      skew25dVolPoints: structure === null ? null : structure.skew25dVolPoints,
      skew25dExpiryIso: structure === null ? null : structure.skew25dExpiryIso,
      windows: request.windows.map((windowDays) => windowStatsOf(ordered, windowDays)),
    }
  }
  return {
    source: request.source,
    stale: request.now - latest.capturedAt > staleMs,
    latestCapturedAt: latest.capturedAt,
    rv20,
    vrp: latestIv === null || rv20 === null ? null : latestIv - rv20,
    termStructure,
    skew25dVolPoints: structure === null ? null : structure.skew25dVolPoints,
    skew25dExpiryIso: structure === null ? null : structure.skew25dExpiryIso,
    windows: request.windows.map((windowDays) => windowStatsOf(ordered, windowDays)),
  }
}
