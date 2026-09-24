/** 按固定周期长度计算最新 K 线收线倒计时，不涉及交易日历。 */

const PERIOD_DURATION_MS: Readonly<Record<string, number>> = {
  '1min': 60_000,
  '5min': 300_000,
  '15min': 900_000,
  '30min': 1_800_000,
  '60min': 3_600_000,
  '4h': 14_400_000,
  daily: 86_400_000,
}

/** 返回距本根 K 线结束的毫秒数；不支持、尚未开始或已经收线时返回 null。 */
export function getLastPriceRemainingMs(
  period: string,
  barTimestamp: number,
  now: number = Date.now(),
): number | null {
  const duration = PERIOD_DURATION_MS[period]
  if (!duration || !Number.isFinite(barTimestamp) || !Number.isFinite(now)) return null
  const remaining = barTimestamp + duration - now
  return now >= barTimestamp && remaining > 0 ? remaining : null
}

/** 格式化收线倒计时；不足一秒向上取整，避免提前显示 00:00。 */
export function formatLastPriceCountdown(
  period: string,
  barTimestamp: number,
  now: number = Date.now(),
): string | null {
  const remaining = getLastPriceRemainingMs(period, barTimestamp, now)
  if (remaining === null) return null
  const seconds = Math.ceil(remaining / 1_000)
  const hours = Math.floor(seconds / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  const rest = seconds % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`
}
