/** 依据市场时区与交易时段推算本根 K 线结束点，并给出收线倒计时。 */
import type { KLinePeriod } from '../../../data/provider/types.js'
import { isDailyPeriod } from '../../../foundation/types/chartPeriod.js'
import {
  getMinuteOfDayInTimeZone,
  type MarketSessionConfig,
  minuteOfDayToTimestamp,
} from '../../../foundation/utils/sessionTimeLabels.js'

/** 日内周期对应的交易分钟数；偏长周期沿用日线的收盘规则。 */
const INTRADAY_PERIOD_MINUTES = {
  '1min': 1,
  '5min': 5,
  '15min': 15,
  '30min': 30,
  '60min': 60,
  '4h': 240,
} as const satisfies Readonly<Partial<Record<KLinePeriod, number>>>

type IntradayPeriod = keyof typeof INTRADAY_PERIOD_MINUTES

/** 判断周期是否登记在日内分钟表中。 */
function isIntradayPeriod(period: string): period is IntradayPeriod {
  return Object.hasOwn(INTRADAY_PERIOD_MINUTES, period)
}

/** 沿交易时段推进开线分钟，跳过休市间隔；不足整周期的末根在当日收盘结束。 */
function resolveIntradayCloseMinute(
  openMinute: number,
  durationMinutes: number,
  sessions: MarketSessionConfig['sessions'],
): number | null {
  const first = sessions.findIndex(({ open, close }) => openMinute >= open && openMinute < close)
  if (first < 0) return null
  let remaining = durationMinutes
  for (let index = first; index < sessions.length; index++) {
    const session = sessions[index]!
    const start = index === first ? openMinute : session.open
    const available = session.close - start
    if (remaining <= available) return start + remaining
    remaining -= available
  }
  return sessions[sessions.length - 1]!.close
}

/** 返回距本根结束点的实际毫秒数；缺少市场配置、时间戳无效或已收线时返回 null。 */
export function getLastPriceRemainingMs(
  period: string,
  barTimestamp: number,
  marketSession: MarketSessionConfig | undefined,
  now: number,
): number | null {
  if (!marketSession || marketSession.sessions.length === 0 || !Number.isFinite(now)) return null
  const openMinute = getMinuteOfDayInTimeZone(barTimestamp, marketSession.timeZone)
  if (openMinute === null || now < barTimestamp) return null

  const sessions = marketSession.sessions
  let closeMinute: number | null
  if (isDailyPeriod(period)) {
    closeMinute = sessions[sessions.length - 1]!.close
  } else if (isIntradayPeriod(period)) {
    closeMinute = resolveIntradayCloseMinute(openMinute, INTRADAY_PERIOD_MINUTES[period], sessions)
  } else {
    return null
  }
  if (closeMinute === null) return null

  const closesAt = minuteOfDayToTimestamp(barTimestamp, closeMinute, marketSession.timeZone)
  const remaining = closesAt - now
  return remaining > 0 ? remaining : null
}

/** 将剩余时间格式化为 mm:ss 或 hh:mm:ss，不足一秒向上取整。 */
export function formatLastPriceCountdown(
  period: string,
  barTimestamp: number,
  marketSession: MarketSessionConfig | undefined,
  now: number,
): string | null {
  const remaining = getLastPriceRemainingMs(period, barTimestamp, marketSession, now)
  if (remaining === null) return null
  const seconds = Math.ceil(remaining / 1_000)
  const hours = Math.floor(seconds / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  const pad = (value: number) => String(value).padStart(2, '0')
  const text = `${pad(minutes)}:${pad(seconds % 60)}`
  return hours > 0 ? `${pad(hours)}:${text}` : text
}
