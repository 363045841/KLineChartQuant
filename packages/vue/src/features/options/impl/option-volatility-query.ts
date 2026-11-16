// 把期权长窗口波动统计包装成 Agent 可调用的只读工具。
//
// 与 option_snapshot 的分工：快照回答「现在什么结构」，本工具回答「当前 IV 在历史
// 窗口里处于什么位置」。统计只来自日级样本（缺失时回退小时行），不读分钟行。

import type { RuntimeToolDefinition } from '@363045841yyt/klinechart-agent-runtime'
import { Type } from 'typebox'
import type {
  OptionPanelSource,
  OptionTermPoint,
  OptionVolatilityStats,
  OptionWindowStats,
} from '../types.js'
import { readCurrency, readFormat, resolveCurrency } from './option-tool-input.js'
import { parseOptionStats } from './parse-option-series.js'

/** 单次最多请求几个窗口：与服务端上限一致。 */
const MAX_WINDOWS = 3

/** 窗口天数上限：与服务端日行保留期一致。 */
const MAX_WINDOW_DAYS = 3_650

/** 工具名。 */
export const OPTION_VOLATILITY_QUERY_TOOL_NAME = 'option_volatility_query'

/** 工具元数据。 */
export const OPTION_VOLATILITY_QUERY_TOOL_METADATA = {
  name: OPTION_VOLATILITY_QUERY_TOOL_NAME,
  label: 'Read option volatility statistics',
  description:
    'Read long-window implied-volatility statistics of one underlying from the daily option layer: ' +
    'IV Rank and IV Percentile for each requested window (default 30/90/365 calendar days), the window high and ' +
    'low, how many sample days exist, plus RV20 (20-day annualised realised volatility from daily closes) and VRP ' +
    '(implied minus realised). Use this instead of option_snapshot when the question is about where current ' +
    'volatility sits historically, or when a custom window (7, 180, 1000 days) is needed. ' +
    'RULES: quote every percentile together with its window and sample days; when sampleDays is far below the ' +
    'window, say "only N days" instead of implying a full window. A low percentile means current IV sits low ' +
    'inside that window — it is NOT a claim that risk is low, and it is never an entry, stop or sizing input. ' +
    'Term structure and the 25Δ risk reversal come from the latest daily row: quote the skew together with its ' +
    'expiry and read a negative value as downside protection being more expensive. When either is absent, say it ' +
    'is unavailable instead of estimating it. ' +
    'After an expiry roll the near-term IV refers to a different contract, so historical percentiles are not ' +
    'directly comparable.',
} as const

const OptionVolatilityParameters = Type.Object(
  {
    currency: Type.Optional(
      Type.String({
        minLength: 2,
        maxLength: 16,
        description:
          'Option underlying such as BTC or ETH. Omit to derive it from the symbol currently on the chart.',
      }),
    ),
    windows: Type.Optional(
      Type.Array(Type.Integer({ minimum: 1, maximum: MAX_WINDOW_DAYS }), {
        minItems: 1,
        maxItems: MAX_WINDOWS,
        description: 'Calendar-day windows, at most 3 values. Defaults to 30, 90 and 365.',
      }),
    ),
    format: Type.Optional(
      Type.Union([Type.Literal('text'), Type.Literal('json')], {
        description:
          'text (default) returns a readable report; json returns the parsed statistics.',
      }),
    ),
  },
  { additionalProperties: false },
)

/** 判断是否为普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 读取窗口参数：去重、保序。
 *
 * @param input 工具输入
 * @returns 窗口天数；未传时为 undefined，非法时为 null
 */
function readWindows(input: unknown): readonly number[] | undefined | null {
  if (!isRecord(input)) return undefined
  const raw = input.windows
  if (raw === undefined) return undefined
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_WINDOWS) return null
  const windows: number[] = []
  for (const item of raw) {
    if (typeof item !== 'number' || !Number.isSafeInteger(item)) return null
    if (item < 1 || item > MAX_WINDOW_DAYS) return null
    if (!windows.includes(item)) windows.push(item)
  }
  return windows
}

/**
 * 百分比文本。
 *
 * @param value 百分数；null 显示破折号
 * @param digits 小数位
 * @returns 文本
 */
function percent(value: number | null, digits: number): string {
  return value === null ? '—' : `${value.toFixed(digits)}%`
}

/**
 * 带符号的波动点文本。
 *
 * @param value 数值；null 显示破折号
 * @returns 文本
 */
function signedPoints(value: number | null): string {
  if (value === null) return '—'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}pp`
}

/**
 * 一个窗口的一行说明。
 *
 * @param window 窗口统计
 * @returns 一行文本
 */
function windowLine(window: OptionWindowStats): string {
  const sample = `样本 ${window.sampleDays}/${window.expectedDays} 天`
  const range = `窗口 ${percent(window.ivLow, 1)}–${percent(window.ivHigh, 1)}`
  const latest = `最新 ${percent(window.ivLatest, 1)}`
  if (window.ivRank === null || window.ivPercentile === null) {
    return (
      `${window.windowDays} 天：分位不可用（${sample}；至少需要 5 个样本日）` +
      ` | ${range} | ${latest}`
    )
  }
  return (
    `${window.windowDays} 天：IV Rank ${window.ivRank.toFixed(1)}` +
    ` | IV Percentile ${window.ivPercentile.toFixed(1)}` +
    ` | ${range} | ${latest} | ${sample}`
  )
}

/**
 * 期限结构一行：每个到期写成「日期 DTE IV」。
 *
 * @param points 期限结构
 * @returns 一行文本；没有数据时写原因
 */
function termStructureLine(points: readonly OptionTermPoint[] | null): string {
  if (points === null || points.length === 0) return '不可用（最新样本行没有逐到期 IV）'
  const parts = points.map(
    (point) => `${point.expiryIso} ${point.dteDays.toFixed(1)}d ${percent(point.atmIvPercent, 1)}`,
  )
  return parts.join(' · ')
}

/**
 * 25Δ 风险逆转一行。必须带到期日：不同期限的偏斜不可直接比较。
 *
 * @param stats 统计结果
 * @returns 一行文本；没有数据时写原因
 */
function skewLine(stats: OptionVolatilityStats): string {
  if (stats.skew25dVolPoints === null) return '不可用（没有 7 天以上的到期，或缺 25Δ 两翼）'
  const tenor = stats.skew25dExpiryIso === null ? '' : `（${stats.skew25dExpiryIso}）`
  return `${signedPoints(stats.skew25dVolPoints)}${tenor}；负值表示下行保护更贵`
}

/**
 * 生成给模型读的纯文本报告。
 *
 * 每个缺口都写明原因：缺样本写样本数，缺失的指标写不可用的原因，不用 0 或估计值顶替。
 *
 * @param currency 期权标的
 * @param stats 统计结果
 * @returns 多行报告
 */
function formatStatsReport(currency: string, stats: OptionVolatilityStats): string {
  const source =
    stats.source === 'daily'
      ? '日行样本'
      : stats.source === 'hourly'
        ? '小时行样本（日行缺失，已回退）'
        : '无样本'
  const latest =
    stats.latestCapturedAt === null ? '无样本' : new Date(stats.latestCapturedAt).toISOString()
  const stale = stats.stale ? '，已过期' : ''
  const lines = [`${currency} 波动统计（${source}，最新样本 ${latest}${stale}）：`]
  for (const window of stats.windows) {
    lines.push(`  ${windowLine(window)}`)
  }
  lines.push(
    `  RV20：${stats.rv20 === null ? '不可用（日收盘不足 21 个）' : percent(stats.rv20, 1)}`,
  )
  lines.push(
    `  VRP：${stats.vrp === null ? '不可用（缺 RV20）' : signedPoints(stats.vrp)}` +
      `（= 最新平值 IV − RV20）`,
  )
  lines.push(`  期限结构：${termStructureLine(stats.termStructure)}`)
  lines.push(`  25Δ 风险逆转：${skewLine(stats)}`)
  lines.push('  口径：分位是当前 IV 在窗口内的位置，不是风险大小；引用时必须带窗口与样本天数。')
  return lines.join('\n')
}

/**
 * 创建期权波动统计工具。
 *
 * @param source 期权数据来源
 * @param currentUnderlying 取当前图表的期权标的（省略 currency 参数时使用）
 * @returns 只读工具定义
 */
export function createOptionVolatilityQueryTool(
  source: OptionPanelSource,
  currentUnderlying: () => string | null,
): RuntimeToolDefinition {
  return {
    ...OPTION_VOLATILITY_QUERY_TOOL_METADATA,
    parameters: OptionVolatilityParameters,
    safety: 'read-only',
    reversible: false,
    executionMode: 'parallel',
    summarizeInput: (input) => {
      const currency = readCurrency(input)
      return currency === undefined ? 'current underlying' : currency.toUpperCase()
    },
    async execute(input, context) {
      context.signal.throwIfAborted()
      const currency = resolveCurrency(readCurrency(input), currentUnderlying)
      if (currency === null) {
        return {
          content:
            '没有可用的期权标的。请传入 currency（BTC 或 ETH），' +
            '或先让图表显示有期权源的品种（例如 BTCUSDT 永续）。',
          summary: '缺少期权标的。',
        }
      }
      const windows = readWindows(input)
      if (windows === null) {
        return {
          content: `windows 需要 1–${MAX_WINDOWS} 个 1–${MAX_WINDOW_DAYS} 之间的整数。`,
          summary: '窗口参数非法。',
        }
      }
      context.progress({ label: `读取期权波动统计 ${currency}`, current: 1, total: 1 })
      try {
        const stats = parseOptionStats(await source.fetchStats(currency, windows, context.signal))
        if (stats === null) {
          return {
            content:
              `没有取到 ${currency} 的波动统计。` +
              '可能是该标的没有期权源，或日行/小时行尚未生成（需要先跑 backfill-options）。' +
              '不要用分钟级样本冒充长窗口结论，请告知用户这个缺口。',
            summary: `没有 ${currency} 的波动统计。`,
          }
        }
        if (readFormat(input) === 'json') {
          return {
            content: JSON.stringify({ currency, ...stats }),
            summary: `已返回 ${currency} 的波动统计。`,
          }
        }
        return {
          content: formatStatsReport(currency, stats),
          summary: `已返回 ${currency} 的波动统计。`,
        }
      } catch (error) {
        context.signal.throwIfAborted()
        const reason = error instanceof Error ? error.message : String(error)
        return {
          content:
            `读取期权波动统计失败：${reason}。` +
            '统计由 `analytics serve` 的 /options/stats 提供，数据来自日行分片；' +
            '请告知用户检查服务与采集状态，不要自行推算分位。',
          summary: '期权统计服务不可用。',
          failure: {
            code: 'TOOL_ERROR',
            message: 'Option volatility statistics are unavailable.',
            retryable: true,
          },
        }
      }
    },
  }
}
