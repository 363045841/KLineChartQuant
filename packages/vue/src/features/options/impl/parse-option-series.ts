// 期权序列响应解析：把 8093 `/options/series` 的 JSON 收成只读视图。
//
// 服务端字段缺失是常态（例如某天没有 gamma 翻转），所以这里逐字段降级成 null，
// 只在整体结构不对时返回 null；用类型断言换来的「看起来有值」比报错更难查。

import type {
  OptionGammaWallView,
  OptionLevelSetView,
  OptionNearTermView,
  OptionPanelView,
  OptionStatsSource,
  OptionTermPoint,
  OptionTrendRange,
  OptionVolatilityContext,
  OptionVolatilityStats,
  OptionWallView,
  OptionWindowStats,
} from '../types.js'

/** 一天的毫秒数；用于找 24 小时前的基准采样。 */
const DAY_MS = 86_400_000

/** 一列采样：采集时刻与取值。 */
interface Sample {
  readonly at: number
  readonly value: number
}

/** 判断是否为普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 读取有限数字；缺失或非数字返回 null。 */
function numberOf(source: unknown, key: string): number | null {
  if (!isRecord(source)) return null
  const value = source[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** 读取字符串；缺失返回 null。 */
function textOf(source: unknown, key: string): string | null {
  if (!isRecord(source)) return null
  const value = source[key]
  return typeof value === 'string' ? value : null
}

/** 读取嵌套对象；不是对象时返回 null。 */
function recordOf(source: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(source)) return null
  const value = source[key]
  return isRecord(value) ? value : null
}

/**
 * 解析一个墙位。
 *
 * @param source 关键位所在对象
 * @param key 字段名（callWall / putWall）
 * @returns 墙位；缺行权价或持仓时返回 null
 */
function wallOf(source: unknown, key: string): OptionWallView | null {
  const wall = recordOf(source, key)
  const strike = numberOf(wall, 'strike')
  const openInterest = numberOf(wall, 'openInterest')
  if (strike === null || openInterest === null) return null
  return { strike, openInterest }
}

/**
 * 解析一个 Gamma 加权墙位。
 *
 * @param source 关键位所在对象
 * @param key 字段名（callGammaWall / putGammaWall）
 * @returns 加权墙位；缺行权价或权重时返回 null
 */
function gammaWallOf(source: unknown, key: string): OptionGammaWallView | null {
  const wall = recordOf(source, key)
  const strike = numberOf(wall, 'strike')
  const gammaWeight = numberOf(wall, 'gammaWeight')
  if (strike === null || gammaWeight === null) return null
  return { strike, gammaWeight }
}

/**
 * 解析一套关键位。
 *
 * @param source 近月或全链对象
 * @returns 关键位视图
 */
function levelSetOf(source: unknown): OptionLevelSetView {
  return {
    gammaFlipUsd: numberOf(source, 'gammaFlipUsd'),
    callWall: wallOf(source, 'callWall'),
    putWall: wallOf(source, 'putWall'),
    callGammaWall: gammaWallOf(source, 'callGammaWall'),
    putGammaWall: gammaWallOf(source, 'putGammaWall'),
    maxPainUsd: numberOf(source, 'maxPainUsd'),
    netGexUsdPerPercent: numberOf(source, 'netGexUsdPerPercent'),
    putCallOiRatio: numberOf(source, 'putCallOiRatio'),
    totalOpenInterest: numberOf(source, 'totalOpenInterest'),
    contractCount: numberOf(source, 'contractCount'),
  }
}

/**
 * 解析近月视图：关键位之外多带波动字段。
 *
 * @param source 近月对象
 * @returns 近月视图
 */
function nearTermOf(source: unknown): OptionNearTermView {
  return {
    ...levelSetOf(source),
    expiryIso: textOf(source, 'expiryIso'),
    dteDays: numberOf(source, 'dteDays'),
    atmIvPercent: numberOf(source, 'atmIvPercent'),
    sigmaLowerUsd: numberOf(source, 'sigmaLowerUsd'),
    sigmaUpperUsd: numberOf(source, 'sigmaUpperUsd'),
    sigma2LowerUsd: numberOf(source, 'sigma2LowerUsd'),
    sigma2UpperUsd: numberOf(source, 'sigma2UpperUsd'),
  }
}

/**
 * 收集一列数值。
 *
 * @param rows 序列行
 * @param read 从一行里取出目标数值
 * @returns 采集时刻与取值都齐全的采样
 */
function samplesOf(
  rows: readonly unknown[],
  read: (row: Record<string, unknown>) => number | null,
): Sample[] {
  const samples: Sample[] = []
  for (const row of rows) {
    if (!isRecord(row)) continue
    const at = numberOf(row, 'capturedAt')
    const value = read(row)
    if (at === null || value === null) continue
    samples.push({ at, value })
  }
  return samples
}

/**
 * 一段窗口内的区间与变化。
 *
 * @param samples 采样；按采集时刻升序
 * @returns 区间；少于两个样本时返回 null
 */
function rangeOf(samples: readonly Sample[]): OptionTrendRange | null {
  const first = samples[0]
  const last = samples[samples.length - 1]
  if (samples.length < 2 || first === undefined || last === undefined) return null
  let min = first.value
  let max = first.value
  for (const sample of samples) {
    if (sample.value < min) min = sample.value
    if (sample.value > max) max = sample.value
  }
  return { min, max, latest: last.value, change: last.value - first.value }
}

/**
 * 不晚于 24 小时前的最新取值。
 *
 * @param samples 采样；按采集时刻升序
 * @param latestAt 最新采样的采集时刻
 * @returns 基准值；窗口不足 24 小时时为 null
 */
function dayAgoOf(samples: readonly Sample[], latestAt: number): number | null {
  const limit = latestAt - DAY_MS
  let value: number | null = null
  for (const sample of samples) if (sample.at <= limit) value = sample.value
  return value
}

/**
 * 最新值在窗口内的分位。
 *
 * @param samples 采样；按采集时刻升序
 * @returns 0–100 的整数；少于两个样本时返回 null
 */
function percentileOf(samples: readonly Sample[]): number | null {
  const last = samples[samples.length - 1]
  if (samples.length < 2 || last === undefined) return null
  const atOrBelow = samples.filter((sample) => sample.value <= last.value).length
  return Math.round((atOrBelow / samples.length) * 100)
}

/**
 * 用整段序列算波动上下文。
 *
 * @param rows 序列行
 * @param latestAt 最新一行的采集时刻
 * @returns 波动上下文；只有一行采样时各项为 null
 */
function trendOf(rows: readonly unknown[], latestAt: number): OptionVolatilityContext {
  const first = isRecord(rows[0]) ? numberOf(rows[0], 'capturedAt') : null
  const atmIvSamples = samplesOf(rows, (row) => numberOf(recordOf(row, 'nearTerm'), 'atmIvPercent'))
  const putCallSamples = samplesOf(rows, (row) =>
    numberOf(recordOf(row, 'nearTerm'), 'putCallOiRatio'),
  )
  const atmIv = rangeOf(atmIvSamples)
  const putCall = rangeOf(putCallSamples)
  const atmIvDayAgo = dayAgoOf(atmIvSamples, latestAt)
  const putCallDayAgo = dayAgoOf(putCallSamples, latestAt)
  return {
    samples: rows.length,
    windowMs: first === null ? 0 : latestAt - first,
    atmIv,
    putCall,
    atmIvPercentile: percentileOf(atmIvSamples),
    atmIvChange24h: atmIv === null || atmIvDayAgo === null ? null : atmIv.latest - atmIvDayAgo,
    putCallChange24h:
      putCall === null || putCallDayAgo === null ? null : putCall.latest - putCallDayAgo,
  }
}

/**
 * 解析一次序列响应，取最后一行的快照。
 *
 * @param raw 响应原文解析后的值
 * @returns 面板视图；没有行或缺少采集时刻与标的时返回 null
 */
export function parseOptionSeries(raw: unknown): OptionPanelView | null {
  const rows = isRecord(raw) ? raw.rows : undefined
  if (!Array.isArray(rows) || rows.length === 0) return null
  const last: unknown = rows[rows.length - 1]
  if (!isRecord(last)) return null
  const capturedAt = numberOf(last, 'capturedAt')
  const currency = textOf(last, 'currency')
  if (capturedAt === null || currency === null) return null
  const gammaFlip = recordOf(last, 'gammaFlip')
  const mainFlip = numberOf(gammaFlip, 'gammaFlipUsd') ?? numberOf(last, 'gammaFlipUsd')
  return {
    currency,
    venue: textOf(last, 'venue'),
    capturedAt,
    spotIndex: numberOf(last, 'spotIndex'),
    nearTerm: nearTermOf(recordOf(last, 'nearTerm')),
    allChain: levelSetOf(recordOf(last, 'allChain')),
    gammaFlipUsd: mainFlip,
    gammaFlipSource: textOf(gammaFlip, 'source'),
    trend: trendOf(rows, capturedAt),
    volatility: null,
  }
}

/**
 * 读统计来源层。
 *
 * @param raw 响应
 * @returns 来源层；取值不在枚举内时为 null
 */
function statsSourceOf(raw: unknown): OptionStatsSource | null {
  const value = textOf(raw, 'source')
  if (value === 'daily' || value === 'hourly' || value === 'none') return value
  return null
}

/**
 * 解析一个窗口的统计。
 *
 * @param raw 窗口对象
 * @returns 窗口统计；缺少窗口天数或样本天数时返回 null
 */
function windowStatsOf(raw: unknown): OptionWindowStats | null {
  const windowDays = numberOf(raw, 'windowDays')
  const sampleDays = numberOf(raw, 'sampleDays')
  const expectedDays = numberOf(raw, 'expectedDays')
  if (windowDays === null || sampleDays === null || expectedDays === null) return null
  return {
    windowDays,
    sampleDays,
    expectedDays,
    ivLatest: numberOf(raw, 'ivLatest'),
    ivHigh: numberOf(raw, 'ivHigh'),
    ivLow: numberOf(raw, 'ivLow'),
    ivRank: numberOf(raw, 'ivRank'),
    ivPercentile: numberOf(raw, 'ivPercentile'),
  }
}

/**
 * 解析期限结构。
 *
 * @param raw 期限结构字段
 * @returns 到期点列表；字段缺失或不合法时返回 null
 */
function termStructureOf(raw: unknown): readonly OptionTermPoint[] | null {
  if (!Array.isArray(raw)) return null
  const points: OptionTermPoint[] = []
  for (const item of raw) {
    const expiryIso = textOf(item, 'expiryIso')
    const dteDays = numberOf(item, 'dteDays')
    const atmIvPercent = numberOf(item, 'atmIvPercent')
    if (expiryIso === null || dteDays === null || atmIvPercent === null) return null
    points.push({ expiryIso, dteDays, atmIvPercent })
  }
  return points
}

/**
 * 解析一次波动统计响应。
 *
 * @param raw 响应原文解析后的值
 * @returns 统计；结构不符合预期时返回 null
 */
export function parseOptionStats(raw: unknown): OptionVolatilityStats | null {
  if (!isRecord(raw)) return null
  const source = statsSourceOf(raw)
  if (source === null) return null
  const stale = raw.stale
  if (typeof stale !== 'boolean') return null
  const windowsRaw = raw.windows
  if (!Array.isArray(windowsRaw)) return null
  const windows: OptionWindowStats[] = []
  for (const item of windowsRaw) {
    const window = windowStatsOf(item)
    if (window === null) return null
    windows.push(window)
  }
  return {
    source,
    stale,
    latestCapturedAt: numberOf(raw, 'latestCapturedAt'),
    rv20: numberOf(raw, 'rv20'),
    vrp: numberOf(raw, 'vrp'),
    termStructure: termStructureOf(raw.termStructure),
    skew25dVolPoints: numberOf(raw, 'skew25dVolPoints'),
    skew25dExpiryIso: textOf(raw, 'skew25dExpiryIso'),
    windows,
  }
}
