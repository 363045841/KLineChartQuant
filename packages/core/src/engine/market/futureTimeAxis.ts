/**
 * 交易日历外推模块：从最后一根 bar 的时间戳按交易日历外推未来槽位的时间戳。
 * 纯函数、不引入假日数据源；索引制轴自愈——真实 bar 到达后覆盖预测标签，误差零累积。
 */
import type { MarketSessionConfig } from '../../foundation/utils/sessionTimeLabels.js'

const DAY_MS = 86_400_000

const WEEKDAY_FORMATTER_CACHE_LIMIT = 16
const weekdayFormatterCache = new Map<string, Intl.DateTimeFormat>()

const WEEKDAY_SHORT_TO_NUMBER: Readonly<Record<string, number>> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

/** tradingDays 缺省时的全周展开 */
const ALL_WEEK_DAYS: ReadonlyArray<number> = [0, 1, 2, 3, 4, 5, 6]

/**
 * 获取可复用的时区星期 formatter（缓存有上限，超限清空，同 sessionTimeLabels 模式）。
 */
function getWeekdayFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = weekdayFormatterCache.get(timeZone)
  if (cached) return cached

  const formatter = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' })
  if (weekdayFormatterCache.size >= WEEKDAY_FORMATTER_CACHE_LIMIT) {
    weekdayFormatterCache.clear()
  }
  weekdayFormatterCache.set(timeZone, formatter)
  return formatter
}

/**
 * 判定时间戳在 session.timeZone 日历下是否为交易日。
 * 必须经时区换算：UTC 与 Asia/Shanghai 的日界不同，禁止裸 getUTCDay()。
 */
function isTradingDay(timestamp: number, session: MarketSessionConfig): boolean {
  const weekday = WEEKDAY_SHORT_TO_NUMBER[getWeekdayFormatter(session.timeZone).format(timestamp)]
  // 空数组是病态输入（会导致跳日循环空转），按缺省全周处理
  const tradingDays = session.tradingDays?.length ? session.tradingDays : ALL_WEEK_DAYS
  return tradingDays.includes(weekday)
}

/**
 * sessions 是否全天覆盖且全周交易：满足则未来区按日历线性外推。
 */
function isContinuous(session: MarketSessionConfig): boolean {
  const allDay = session.sessions.some((r) => r.open === 0 && r.close >= 24 * 60)
  if (!allDay) return false
  // tradingDays 缺省或空数组（病态输入）都视为全周交易
  if (!session.tradingDays?.length) return true
  return session.tradingDays.length >= 7
}

/**
 * 从最后一根 bar 的时间戳外推第 steps 个未来槽位的时间戳。
 * @param session 市场画像（含 timeZone 与可选 tradingDays）
 * @param lastTimestamp 最后一根 bar 的时间戳
 * @param steps 向未来外推的槽位数，<= 0 时原样返回
 * @param periodMs 相邻槽位的名义周期（毫秒）
 * @returns 外推后的时间戳（UTC ms）
 */
export function projectTradingTimestamp(
  session: MarketSessionConfig,
  lastTimestamp: number,
  steps: number,
  periodMs: number,
): number {
  if (steps <= 0) return lastTimestamp

  if (isContinuous(session)) {
    return lastTimestamp + steps * periodMs
  }

  let ts = lastTimestamp
  if (periodMs < DAY_MS) {
    // 日内：session 内逐槽线性步进；某槽落点非交易日则整日跳到下一交易日，保持时刻
    for (let i = 0; i < steps; i++) {
      ts += periodMs
      while (!isTradingDay(ts, session)) ts += DAY_MS
    }
    return ts
  }

  // 日及以上：逐交易日推进——每 step 前进一个日历日并对齐到交易日，直到完成 steps 次
  for (let i = 0; i < steps; i++) {
    ts += DAY_MS
    while (!isTradingDay(ts, session)) ts += DAY_MS
  }
  return ts
}
