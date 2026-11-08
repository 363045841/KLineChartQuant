/** 两种执行后端共用时间语义；Intl只在宿主执行，VM不自行猜测时区或交易日。 */
import type { ScriptMarketSession, ScriptTimeContext, ScriptSessionRange } from './time.js'

const DAY = 86_400_000
const ALIASES: Readonly<Record<string, string>> = {
  '1min': '1',
  '5min': '5',
  '15min': '15',
  '30min': '30',
  '60min': '60',
  '4h': '240',
  daily: '1D',
  weekly: '1W',
  monthly: '1M',
  quarterly: '3M',
  yearly: '12M',
  D: '1D',
  W: '1W',
  M: '1M',
}

/** 将宿主周期名转换为Pine周期字符串。 */
export function pinePeriod(value: string): string {
  return ALIASES[value] ?? value
}

/** 周期比较仅用于合法性检查；实际月边界使用日历，绝不按30天分桶。 */
export function timeframeSeconds(value: string): number {
  const match = /^(\d+)([SDWM]?)$/.exec(pinePeriod(value))
  if (!match) throw new TypeError(`未知周期：${value}`)
  const count = Number(match[1])
  if (!(count > 0)) throw new TypeError('周期必须大于0')
  return count * ({ S: 1, D: 86400, W: 604800, M: 2629800 }[match[2]!] ?? 60)
}

// 各级缓存都有容量上限；会话缓存以只读配置对象为弱键，配置替换后自然失效。
const ZONE_CACHE_LIMIT = 8
const DATE_PARTS_CACHE_LIMIT = 8192
const WALL_CACHE_LIMIT = 512
const SESSION_VARIANT_LIMIT = 16
const SESSION_DAY_LIMIT = 128
const CUSTOM_CACHE_LIMIT = 64

interface DateParts {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly minute: number
  readonly dayIndex: number
  readonly date: string
}
interface ZoneClock {
  readonly formatter: Intl.DateTimeFormat
  readonly dates: Map<number, DateParts>
  readonly walls: Map<number, number>
}
interface ActiveSessionRange {
  readonly start: number
  readonly end: number
  readonly day: number
  readonly range: ScriptSessionRange
}
const zoneClocks = new Map<string, ZoneClock>()
const sessionDays = new WeakMap<
  ScriptMarketSession,
  Map<string, Map<number, readonly ActiveSessionRange[]>>
>()
const extendedClocks = new WeakMap<
  ScriptMarketSession,
  { premarket: ScriptMarketSession; postmarket: ScriptMarketSession }
>()
const customSpecifications = new Map<
  string,
  { days: string; ranges: readonly ScriptSessionRange[] }
>()

/** FIFO 淘汰单项，不在高频命中路径创建闭包或维护访问顺序。 */
function remember<K, V>(cache: Map<K, V>, key: K, value: V, limit: number): V {
  if (cache.size >= limit && !cache.has(key)) cache.delete(cache.keys().next().value!)
  cache.set(key, value)
  return value
}

/** 按时区复用 formatter、日期字段与墙钟换算，最多保留固定数量的时区。 */
function zoneClock(zone: string): ZoneClock {
  const cached = zoneClocks.get(zone)
  if (cached) return cached
  return remember(
    zoneClocks,
    zone,
    {
      formatter: new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }),
      dates: new Map(),
      walls: new Map(),
    },
    ZONE_CACHE_LIMIT,
  )
}

/** 同一时间戳复用日期字段；保留完整时间戳键以兼容历史时区的秒级偏移。 */
function parts(timestamp: number, zone: string): DateParts {
  const clock = zoneClock(zone)
  const cached = clock.dates.get(timestamp)
  if (cached) return cached
  let year = 0
  let month = 0
  let day = 0
  let hour = 0
  let minute = 0
  for (const part of clock.formatter.formatToParts(timestamp)) {
    if (part.type === 'year') year = Number(part.value)
    else if (part.type === 'month') month = Number(part.value)
    else if (part.type === 'day') day = Number(part.value)
    else if (part.type === 'hour') hour = Number(part.value)
    else if (part.type === 'minute') minute = Number(part.value)
  }
  return remember(
    clock.dates,
    timestamp,
    {
      year,
      month,
      day,
      minute: hour * 60 + minute,
      dayIndex: Math.floor(Date.UTC(year, month - 1, day) / DAY),
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    },
    DATE_PARTS_CACHE_LIMIT,
  )
}

/** 交易所当地墙钟转为UTC；迭代修正同时覆盖夏令时与跨午夜。 */
function wall(dayIndex: number, minute: number, zone: string): number {
  const desired = dayIndex * DAY + minute * 60_000
  const clock = zoneClock(zone)
  const cached = clock.walls.get(desired)
  if (cached !== undefined) return cached
  let value = desired
  for (let pass = 0; pass < 4; pass++) {
    const actual = parts(value, zone)
    const delta = desired - (actual.dayIndex * DAY + actual.minute * 60_000)
    if (delta === 0) break
    value += delta
  }
  return remember(clock.walls, desired, value, WALL_CACHE_LIMIT)
}

/** 官方年度例外优先于星期模板；没有覆盖的年份不伪造节假日数据。 */
function ranges(timestamp: number, session: ScriptMarketSession): readonly ScriptSessionRange[] {
  const local = parts(timestamp, session.timeZone)
  const calendar = session.calendars?.find((item) => item.year === local.year)
  if (calendar?.closedDates.includes(local.date)) return []
  const special = calendar?.specialSessions.find((item) => item.date === local.date)
  if (special) return special.sessions
  if (
    session.tradingDays &&
    !session.tradingDays.includes(new Date(local.dayIndex * DAY).getUTCDay())
  )
    return []
  return session.sessions
}

/** 自定义Pine时段字符串支持多段、星期过滤与跨午夜。 */
function customRanges(value: string): { days: string; ranges: readonly ScriptSessionRange[] } {
  const cached = customSpecifications.get(value)
  if (cached) return cached
  const [hours, days = '1234567'] = value.split(':')
  if (hours === '24x7')
    return remember(
      customSpecifications,
      value,
      { days, ranges: [{ open: 0, close: 1440 }] },
      CUSTOM_CACHE_LIMIT,
    )
  const list = hours!.split(',').map((item) => {
    const match = /^(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(item)
    if (!match) throw new TypeError('session应为HHmm-HHmm，可附加:1234567')
    const open = Number(match[1]) * 60 + Number(match[2])
    let close = Number(match[3]) * 60 + Number(match[4])
    if (open >= 1440 || close > 1440 || Number(match[2]) > 59 || Number(match[4]) > 59)
      throw new TypeError('无效的session时间')
    if (close <= open) close += 1440
    return { open, close }
  })
  return remember(customSpecifications, value, { days, ranges: list }, CUSTOM_CACHE_LIMIT)
}

/** 一天的实际时段只构建一次，保留既有星期、例外日历、自定义时区与 DST 换算语义。 */
function dayRanges(
  day: number,
  session: ScriptMarketSession,
  custom: string | undefined,
  zone: string,
): readonly ActiveSessionRange[] {
  let variants = sessionDays.get(session)
  if (!variants) {
    variants = new Map()
    sessionDays.set(session, variants)
  }
  const key = `${zone}\0${custom || ''}`
  let days = variants.get(key)
  if (!days) days = remember(variants, key, new Map(), SESSION_VARIANT_LIMIT)
  const cached = days.get(day)
  if (cached) return cached
  const dateTime = wall(day, 720, zone)
  const specification = custom ? customRanges(custom) : undefined
  const active: ActiveSessionRange[] = []
  if (!specification || specification.days.includes(String(new Date(day * DAY).getUTCDay() + 1))) {
    for (const range of specification?.ranges ?? ranges(dateTime, session)) {
      active.push({
        start: wall(day, range.open, zone),
        end: wall(day, range.close, zone),
        day,
        range,
      })
    }
  }
  return remember(days, day, active, SESSION_DAY_LIMIT)
}

/** 返回当前时间所属的实际session片段；午休不计入常规盘，隔夜片段保留所属起始日。 */
function activeRange(
  timestamp: number,
  session: ScriptMarketSession,
  custom?: string,
  zone = session.timeZone,
) {
  const local = parts(timestamp, zone)
  for (const shift of [0, -1]) {
    const day = local.dayIndex + shift
    for (const active of dayRanges(day, session, custom, zone))
      if (timestamp >= active.start && timestamp < active.end) return active
  }
  return undefined
}

/** 盘前盘后会话按原配置身份复用，避免每次查询复制整个市场配置。 */
function extendedSession(
  session: ScriptMarketSession,
  mode: 'premarket' | 'postmarket',
): ScriptMarketSession {
  let cached = extendedClocks.get(session)
  if (!cached) {
    cached = {
      premarket: { ...session, sessions: session.premarket ?? [] },
      postmarket: { ...session, sessions: session.postmarket ?? [] },
    }
    extendedClocks.set(session, cached)
  }
  return cached[mode]
}

/** 宿主时间入口：open/close返回周期边界，tradingday用于跨午夜分组，market等返回0/1。 */
export function timeValue(
  context: ScriptTimeContext | undefined,
  mode: string,
  period: string,
  timestamp: number,
  custom?: string,
  timezone?: string,
): number {
  if (!context) throw new Error('脚本时间API需要宿主提供图表周期和市场交易时段')
  if (!Number.isFinite(timestamp)) return Number.NaN
  const zone = timezone || context.session.timeZone
  const active = activeRange(timestamp, context.session, custom, zone)
  if (mode === 'market') return active ? 1 : 0
  if (mode === 'premarket' || mode === 'postmarket') {
    return activeRange(timestamp, extendedSession(context.session, mode), undefined, zone) ? 1 : 0
  }
  if (custom && !active) return Number.NaN
  const local = parts(timestamp, zone)
  const dayIndex = active?.day ?? local.dayIndex
  const tradingDay = dayIndex + (active && active.range.close > 1440 ? 1 : 0)
  if (mode === 'tradingday') return tradingDay * DAY
  const normalized = pinePeriod(period || context.period)
  const match = /^(\d+)([SDWM]?)$/.exec(normalized)
  if (!match) throw new TypeError(`未知周期：${period}`)
  const count = Number(match[1])
  const unit = match[2]
  let start: number
  let end: number
  if (!unit || unit === 'S') {
    const duration = timeframeSeconds(normalized) * 1000
    const origin = active?.start ?? wall(dayIndex, 0, zone)
    start = origin + Math.floor((timestamp - origin) / duration) * duration
    end = start + duration
    if (active) end = Math.min(end, active.end)
  } else if (unit === 'M') {
    const tradingDate = new Date(tradingDay * DAY)
    const ordinal = tradingDate.getUTCFullYear() * 12 + tradingDate.getUTCMonth()
    const from = Math.floor(ordinal / count) * count
    start = wall(Math.floor(Date.UTC(Math.floor(from / 12), from % 12, 1) / DAY), 0, zone)
    end = wall(
      Math.floor(Date.UTC(Math.floor((from + count) / 12), (from + count) % 12, 1) / DAY),
      0,
      zone,
    )
  } else {
    const span = unit === 'W' ? count * 7 : count
    const from =
      unit === 'W'
        ? Math.floor((tradingDay + 3) / span) * span - 3
        : Math.floor(tradingDay / span) * span
    if (unit === 'D' && count === 1 && active) {
      const dailyRanges = dayRanges(dayIndex, context.session, custom, zone)
      start = dailyRanges[0]!.start
      end = dailyRanges[dailyRanges.length - 1]!.end
    } else {
      start = wall(from, 0, zone)
      end = wall(from + span, 0, zone)
    }
  }
  return mode === 'close' ? end : start
}
