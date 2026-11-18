/**
 * Agent 图元时间契约：字符串与图表时间戳互转。
 *
 * 解析只做两件事：RFC 3339 与偏移量校验、日期简写查表。槽位吸附属于渲染层，
 * 这里不参与；读与写共用同一套格式，模型不需要做任何时区换算。
 */
import { isTradingDate } from '@/data/provider/types.js'
import { resolveDrawingTradingDate } from '@/engine/drawing/index.js'
import { ToolInputValidationError } from '@/foundation/agent/index.js'
import { formatRfc3339InTimeZone, parseRfc3339WithOffset } from '@/foundation/time/index.js'
import { isIntradayPeriod } from '@/foundation/types/chartPeriod.js'

/** 日期简写查表所需的行情快照与周期。 */
export interface DrawingAnchorTimeInput {
  readonly bars: ReadonlyArray<{ readonly date?: string; readonly timestamp: number }>
  readonly period: string
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
 * @param input 当前行情快照与周期
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
  const resolution = resolveDrawingTradingDate(input.bars, value)
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
    case 'date-unavailable':
      throw new ToolInputValidationError(
        'The loaded chart data exposes no per-bar date. Use a full RFC 3339 time instead.',
      )
  }
}
