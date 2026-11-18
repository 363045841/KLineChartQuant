/**
 * Agent 图元时间契约：字符串与图表时间戳互转。
 *
 * 解析只做三件事：RFC 3339 与偏移量校验、日期简写按图表时区落到已有 K 线、
 * 槽位吸附（属于渲染层，这里不参与）。交易日不是独立字段：它由 bar 时间戳在
 * 图表时区下的日期派生，读与写共用同一套格式。
 */
import type { TradingDate } from '@/data/provider/types.js'
import { isTradingDate } from '@/data/provider/types.js'
import { CHART_AGENT_ERROR_CODES, KLineChartError } from '@/errors.js'
import { ToolInputValidationError } from '@/foundation/agent/index.js'
import {
  formatDateInTimeZone,
  formatRfc3339InTimeZone,
  parseRfc3339WithOffset,
} from '@/foundation/time/index.js'
import { isIntradayPeriod } from '@/foundation/types/chartPeriod.js'

/** 日期简写解析所需的行情快照、周期与图表时区。 */
export interface DrawingAnchorTimeInput {
  readonly bars: ReadonlyArray<{ readonly timestamp: number }>
  readonly period: string
  readonly timezone: string
}

/** 日期简写在一段 K 线上的解析结果。 */
type TradingDateResolution =
  | { readonly kind: 'resolved'; readonly timestamp: number }
  | { readonly kind: 'out-of-range'; readonly earliest: string; readonly latest: string }
  | { readonly kind: 'not-trading' }

/**
 * 把日期落到该日第一根 K 线的时间戳。
 *
 * 日期由 bar 的时间戳在图表时区下派生，不依赖任何按日缓存字段；
 * 一次遍历同时得到范围与命中，因此不假设调用方传入的 bar 已排序。
 *
 * @param bars 当前已加载的 K 线
 * @param tradingDate 目标交易日
 * @param timezone 图表时区
 * @returns 命中时间戳、超范围或范围内无该日
 */
function resolveTradingDate(
  bars: ReadonlyArray<{ readonly timestamp: number }>,
  tradingDate: TradingDate,
  timezone: string,
): TradingDateResolution {
  let earliest = ''
  let latest = ''
  let resolved: number | null = null
  for (const bar of bars) {
    const date = formatDateInTimeZone(bar.timestamp, timezone)
    if (earliest === '' || date < earliest) earliest = date
    if (latest === '' || date > latest) latest = date
    if (resolved === null && date === tradingDate) resolved = bar.timestamp
  }
  if (resolved !== null) return { kind: 'resolved', timestamp: resolved }
  if (earliest === '' || tradingDate < earliest || tradingDate > latest) {
    return { kind: 'out-of-range', earliest, latest }
  }
  return { kind: 'not-trading' }
}

/**
 * 把时间戳格式化为图表时区的 RFC 3339。
 *
 * @param timestamp 绝对时间戳（毫秒）
 * @param timezone IANA 时区标识
 * @returns `YYYY-MM-DDTHH:mm:ss±HH:MM`
 */
export function formatDrawingAnchorTime(timestamp: number, timezone: string): string {
  return formatRfc3339InTimeZone(timestamp, timezone)
}

/**
 * 把契约时间解析为绝对时间戳。
 *
 * 完整时间必须带偏移量；只有日线及以上允许 `YYYY-MM-DD`，日内周期直接拒绝，
 * 避免所有锚点落到当天首根 K 线。
 *
 * @param value 模型给出的时间
 * @param input 当前行情快照、周期与图表时区
 * @returns 毫秒时间戳
 */
export function parseDrawingAnchorTime(value: string, input: DrawingAnchorTimeInput): number {
  const parsed = parseRfc3339WithOffset(value)
  if (parsed !== null) return parsed
  if (!isTradingDate(value)) {
    throw new ToolInputValidationError(
      `'${value}' is not an RFC 3339 time with an offset, for example "2026-11-18T09:31:00+08:00".`,
    )
  }
  if (isIntradayPeriod(input.period)) {
    throw new ToolInputValidationError(
      `This chart is ${input.period}; include the time and offset, for example "2026-11-18T09:31:00+08:00".`,
    )
  }
  if (input.bars.length === 0) {
    throw new KLineChartError(
      CHART_AGENT_ERROR_CODES.NO_DATA,
      'No K-line data is loaded, so a trading-date anchor cannot be resolved.',
    )
  }
  const resolution = resolveTradingDate(input.bars, value, input.timezone)
  switch (resolution.kind) {
    case 'resolved':
      return resolution.timestamp
    case 'out-of-range':
      throw new ToolInputValidationError(
        `Date ${value} is outside the loaded range ${resolution.earliest}..${resolution.latest}.`,
      )
    case 'not-trading':
      throw new ToolInputValidationError(
        `No bar exists on ${value} in the loaded chart data. Pick a trading day that has a bar.`,
      )
  }
}
