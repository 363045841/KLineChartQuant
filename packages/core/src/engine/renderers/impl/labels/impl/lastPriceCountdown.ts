/** 最新 K 线的周期倒计时：只依据开线时间戳与周期，不依赖市场时段或交易日历。 */
import { isKLinePeriod, type KLinePeriod } from '@/data/provider/types.js'

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

/** 返回开线时间加一个周期后的剩余毫秒；无效、尚未开线或已经到期时返回 null。 */
export function getLastPriceRemainingMs(
  period: string,
  barTimestamp: number,
  now: number,
): number | null {
  if (
    !isKLinePeriod(period) ||
    !Number.isFinite(barTimestamp) ||
    !Number.isFinite(now) ||
    !Number.isFinite(new Date(barTimestamp).getTime()) ||
    now < barTimestamp
  ) {
    return null
  }
  const length = PERIOD_LENGTHS[period]
  const closesAt =
    length.unit === 'minute'
      ? barTimestamp + length.value * 60_000
      : addUtcMonths(barTimestamp, length.value)
  const remaining = closesAt - now
  return Number.isFinite(remaining) && remaining > 0 ? remaining : null
}

/** 将已派生的剩余毫秒格式化为 mm:ss 或 hh:mm:ss，不足一秒向上取整。 */
export function formatLastPriceCountdown(remainingMs: number | null): string | null {
  if (remainingMs === null || !Number.isFinite(remainingMs) || remainingMs <= 0) return null
  const seconds = Math.ceil(remainingMs / 1_000)
  const hours = Math.floor(seconds / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  const pad = (value: number) => String(value).padStart(2, '0')
  const text = `${pad(minutes)}:${pad(seconds % 60)}`
  return hours > 0 ? `${pad(hours)}:${text}` : text
}
