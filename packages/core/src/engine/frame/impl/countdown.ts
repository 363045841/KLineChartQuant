/** 日线按已配置的交易时段倒数，其余情况按周期长度计算。 */

import { isKLinePeriod, type KLinePeriod } from '@/data/provider/types.js'
import { formatDateInTimeZone } from '@/foundation/time/index.js'
import {
  type MarketSessionConfig,
  minuteOfDayToTimestamp,
} from '@/foundation/utils/sessionTimeLabels.js'

/** 周期长度：分钟周期按分钟累加，月以上周期按日历月增加。 */
type PeriodLength = { unit: 'minute' | 'month'; value: number }

/** 完整覆盖标准周期，新增周期时必须显式定义长度。 */
const PERIOD_LENGTHS = {
  '1min': { unit: 'minute', value: 1 },
  '5min': { unit: 'minute', value: 5 },
  '15min': { unit: 'minute', value: 15 },
  '30min': { unit: 'minute', value: 30 },
  '60min': { unit: 'minute', value: 60 },
  '4h': { unit: 'minute', value: 240 },
  daily: { unit: 'minute', value: 24 * 60 },
  weekly: { unit: 'minute', value: 7 * 24 * 60 },
  monthly: { unit: 'month', value: 1 },
  quarterly: { unit: 'month', value: 3 },
  yearly: { unit: 'month', value: 12 },
} as const satisfies Readonly<Record<KLinePeriod, PeriodLength>>

/** 在 UTC 下增加日历月份，保留开线时刻；目标月份无对应日期时截到月末。 */
function addUtcMonths(timestamp: number, months: number): number {
  const date = new Date(timestamp)
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  const endOfMonth = new Date(date.getTime())
  endOfMonth.setUTCMonth(endOfMonth.getUTCMonth() + 1, 0)
  date.setUTCDate(Math.min(day, endOfMonth.getUTCDate()))
  return date.getTime()
}

/** 日线时间戳用于定位交易日期，当天首段开盘至末段收盘之间显示倒计时。 */
function getDailySessionRemainingMs(
  barTimestamp: number,
  now: number,
  market: MarketSessionConfig,
): number | null {
  const date = formatDateInTimeZone(barTimestamp, market.timeZone)
  const calendar = market.calendars?.find(({ year }) => year === Number(date.slice(0, 4)))
  if (calendar?.closedDates.includes(date)) return null

  const special = calendar?.specialSessions.find((entry) => entry.date === date)
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  if (!special && market.tradingDays && !market.tradingDays.includes(weekday)) return null

  const sessions = special?.sessions ?? market.sessions
  if (sessions.length === 0) return null
  const open = Math.min(...sessions.map((session) => session.open))
  const close = Math.max(...sessions.map((session) => session.close))
  const opensAt = minuteOfDayToTimestamp(barTimestamp, open, market.timeZone)
  const closesAt = minuteOfDayToTimestamp(barTimestamp, close, market.timeZone)
  return now >= opensAt && now < closesAt ? closesAt - now : null
}

/**
 * 返回未到期 K 线的剩余毫秒。
 *
 * @param period 当前周期
 * @param barTimestamp 最后一根 K 线的开盘时间
 * @param now 本帧时间快照
 * @param market 市场时段；仅日线且非近似时段时参与
 * @returns 剩余毫秒；已收盘或无法计算时为 null
 */
export function getLastPriceRemainingMs(
  period: string,
  barTimestamp: number,
  now: number,
  market?: MarketSessionConfig,
): number | null {
  if (
    !isKLinePeriod(period) ||
    !Number.isFinite(barTimestamp) ||
    !Number.isFinite(now) ||
    !Number.isFinite(new Date(barTimestamp).getTime())
  ) {
    return null
  }
  if (period === 'daily' && market && !market.approximate) {
    return getDailySessionRemainingMs(barTimestamp, now, market)
  }
  if (now < barTimestamp) return null
  const length = PERIOD_LENGTHS[period]
  const closesAt =
    length.unit === 'minute'
      ? barTimestamp + length.value * 60_000
      : addUtcMonths(barTimestamp, length.value)
  const remaining = closesAt - now
  return Number.isFinite(remaining) && remaining > 0 ? remaining : null
}

/**
 * 将已派生的剩余毫秒格式化为 mm:ss 或 hh:mm:ss。
 *
 * @param remainingMs 剩余毫秒
 * @returns 倒计时文本；不足一秒按一秒向上取整
 */
export function formatLastPriceCountdown(remainingMs: number | null): string | null {
  if (remainingMs === null || !Number.isFinite(remainingMs) || remainingMs <= 0) return null
  const seconds = Math.ceil(remainingMs / 1_000)
  const hours = Math.floor(seconds / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  const pad = (value: number) => String(value).padStart(2, '0')
  const text = `${pad(minutes)}:${pad(seconds % 60)}`
  return hours > 0 ? `${pad(hours)}:${text}` : text
}
