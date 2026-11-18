/**
 * 图表显示时间的格式化入口。
 *
 * 同一时区只用一份 formatter 实例，标签数量由时间刻度阶梯决定；这里不提供
 * 「单个时间戳 → 字符串」的批量缓存，因为那会把命中率绑到可见工作集上。
 */

import type { MarketSessionTimeFormatter, TimeFormatter, TimeZoneSetting } from '../types.js'
import { readParts, zoneOffsetMs } from './dtf.js'

/** 在渲染高频路径外，一次性解析持久化的显示时区偏好。 */
export function resolveDisplayTimeZone(setting: TimeZoneSetting): string {
  if (setting === 'UTC') return 'UTC'
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** 为显示时区创建格式化器；Intl 实例只在此时构造。 */
export function createTimeFormatter(timeZone: string): TimeFormatter {
  const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const weekdayFormatter = new Intl.DateTimeFormat('zh-CN', { timeZone, weekday: 'short' })

  const formatDate = (timestamp: number): string => {
    const parts = readParts(dateFormatter, timestamp)
    return `${parts.year}-${parts.month}-${parts.day}`
  }
  const formatDateTime = (timestamp: number): string => {
    const parts = readParts(dateTimeFormatter, timestamp)
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
  }

  return Object.freeze({
    timeZone,
    formatDate,
    formatDateTime,
    formatDateWithWeekday: (timestamp: number) =>
      `${weekdayFormatter.format(timestamp)} ${formatDate(timestamp)}`,
    formatDateTimeWithWeekday: (timestamp: number) =>
      `${weekdayFormatter.format(timestamp)} ${formatDateTime(timestamp)}`,
  })
}

/** 非渲染用途的独立 formatter 按 IANA 时区复用；时区数量由配置决定。 */
const standaloneFormatters = new Map<string, TimeFormatter>()

function standaloneFormatter(timeZone: string): TimeFormatter {
  const existing = standaloneFormatters.get(timeZone)
  if (existing) return existing
  const formatter = createTimeFormatter(timeZone)
  standaloneFormatters.set(timeZone, formatter)
  return formatter
}

/** 使用明确的 IANA 时区格式化日期 `YYYY-MM-DD`；交易日等文本与标签共用同一规则。 */
export function formatDateInTimeZone(timestamp: number, timeZone: string): string {
  return standaloneFormatter(timeZone).formatDate(timestamp)
}

/** 使用明确的 IANA 时区格式化非渲染用途的日期时间文本。 */
export function formatDateTimeInTimeZone(timestamp: number, timeZone = 'Asia/Shanghai'): string {
  return standaloneFormatter(timeZone).formatDateTime(timestamp)
}

/**
 * 使用明确的 IANA 时区格式化为 RFC 3339（带偏移量）。
 *
 * Agent 读写图元时间共用这一种形态：字符串自己说明偏移量，读到什么就能原样写回，
 * 调用方不需要在本地时间与 UTC 之间做换算。
 *
 * @param timestamp 绝对时间戳（毫秒）
 * @param timeZone IANA 时区标识
 * @returns `YYYY-MM-DDTHH:mm:ss±HH:MM`
 */
export function formatRfc3339InTimeZone(timestamp: number, timeZone: string): string {
  const offsetMs = zoneOffsetMs(timestamp, timeZone)
  // 加上偏移后的 UTC 字段就是该时区的墙上时间，避免再构造一个 Intl 实例。
  const wall = new Date(timestamp + offsetMs)
  const pad = (value: number): string => String(value).padStart(2, '0')
  const totalMinutes = Math.round(offsetMs / 60_000)
  const absolute = Math.abs(totalMinutes)
  const offset = `${totalMinutes < 0 ? '-' : '+'}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
  return (
    `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}` +
    `T${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}:${pad(wall.getUTCSeconds())}${offset}`
  )
}

/**
 * 解析带偏移量的 RFC 3339 时间。
 *
 * 只接受带 `Z` 或 `±HH:MM` 的完整时间：没有偏移的本地时间无法确定瞬间，
 * 一律返回 null，由调用方给出可执行的错误。
 *
 * @param value 待解析文本
 * @returns 毫秒时间戳；格式不符或无法解析时为 null
 */
export function parseRfc3339WithOffset(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(value)) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** 使用明确的时区格式化独立文本，不进入图表渲染状态。 */
export function formatTimeInTimeZone(
  timestamp: number,
  options: { timeZone: string; showTime: boolean },
): string {
  const formatter = standaloneFormatter(options.timeZone)
  return options.showTime ? formatter.formatDateTime(timestamp) : formatter.formatDate(timestamp)
}

/** 创建仅供分时市场时段标签使用的独立 formatter。 */
export function createMarketSessionTimeFormatter(timeZone: string): MarketSessionTimeFormatter {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  return {
    timeZone,
    formatAxisTime(timestamp: number): string {
      const parts = readParts(formatter, timestamp)
      return `${parts.hour}:${parts.minute}`
    },
  }
}

const marketSessionFormatters = new Map<string, MarketSessionTimeFormatter>()

/** 按 IANA 时区复用市场时段 formatter，避免按标签重复初始化 Intl。 */
export function getMarketSessionTimeFormatter(timeZone: string): MarketSessionTimeFormatter {
  const existing = marketSessionFormatters.get(timeZone)
  if (existing) return existing
  const formatter = createMarketSessionTimeFormatter(timeZone)
  marketSessionFormatters.set(timeZone, formatter)
  return formatter
}
