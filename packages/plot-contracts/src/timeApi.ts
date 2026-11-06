/** 两种执行后端共用时间语义；Intl只在宿主执行，VM不自行猜测时区或交易日。 */
import type { ScriptMarketSession, ScriptTimeContext, ScriptSessionRange } from './time.js'

const DAY = 86_400_000
const ALIASES: Readonly<Record<string, string>> = { '1min': '1', '5min': '5', '15min': '15', '30min': '30', '60min': '60', '4h': '240', daily: '1D', weekly: '1W', monthly: '1M', quarterly: '3M', yearly: '12M', D: '1D', W: '1W', M: '1M' }

/** 将宿主周期名转换为Pine周期字符串。 */
export function pinePeriod(value: string): string { return ALIASES[value] ?? value }

/** 周期比较仅用于合法性检查；实际月边界使用日历，绝不按30天分桶。 */
export function timeframeSeconds(value: string): number {
  const match = /^(\d+)([SDWM]?)$/.exec(pinePeriod(value))
  if (!match) throw new TypeError(`未知周期：${value}`)
  const count = Number(match[1])
  if (!(count > 0)) throw new TypeError('周期必须大于0')
  return count * ({ S: 1, D: 86400, W: 604800, M: 2629800 }[match[2]!] ?? 60)
}

/** 每个时区只创建一个formatter，日历运算与夏令时解析共用。 */
const formatters = new Map<string, Intl.DateTimeFormat>()
function parts(timestamp: number, zone: string) {
  let formatter = formatters.get(zone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    formatters.set(zone, formatter)
  }
  const fields = new Map(formatter.formatToParts(timestamp).map((part) => [part.type, Number(part.value)]))
  const year = fields.get('year')!
  const month = fields.get('month')!
  const day = fields.get('day')!
  return { year, month, day, minute: fields.get('hour')! * 60 + fields.get('minute')!, dayIndex: Math.floor(Date.UTC(year, month - 1, day) / DAY), date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` }
}

/** 交易所当地墙钟转为UTC；迭代修正同时覆盖夏令时与跨午夜。 */
function wall(dayIndex: number, minute: number, zone: string): number {
  const desired = dayIndex * DAY + minute * 60_000
  let value = desired
  for (let pass = 0; pass < 4; pass++) {
    const actual = parts(value, zone)
    const delta = desired - (actual.dayIndex * DAY + actual.minute * 60_000)
    if (delta === 0) return value
    value += delta
  }
  return value
}

/** 官方年度例外优先于星期模板；没有覆盖的年份不伪造节假日数据。 */
function ranges(timestamp: number, session: ScriptMarketSession): readonly ScriptSessionRange[] {
  const local = parts(timestamp, session.timeZone)
  const calendar = session.calendars?.find((item) => item.year === local.year)
  if (calendar?.closedDates.includes(local.date)) return []
  const special = calendar?.specialSessions.find((item) => item.date === local.date)
  if (special) return special.sessions
  if (session.tradingDays && !session.tradingDays.includes(new Date(local.dayIndex * DAY).getUTCDay())) return []
  return session.sessions
}

/** 自定义Pine时段字符串支持多段、星期过滤与跨午夜。 */
function customRanges(value: string): { days: string; ranges: readonly ScriptSessionRange[] } {
  const [hours, days = '1234567'] = value.split(':')
  if (hours === '24x7') return { days, ranges: [{ open: 0, close: 1440 }] }
  const list = hours!.split(',').map((item) => {
    const match = /^(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(item)
    if (!match) throw new TypeError('session应为HHmm-HHmm，可附加:1234567')
    const open = Number(match[1]) * 60 + Number(match[2])
    let close = Number(match[3]) * 60 + Number(match[4])
    if (open >= 1440 || close > 1440 || Number(match[2]) > 59 || Number(match[4]) > 59) throw new TypeError('无效的session时间')
    if (close <= open) close += 1440
    return { open, close }
  })
  return { days, ranges: list }
}

/** 返回当前时间所属的实际session片段；午休不计入常规盘，隔夜片段保留所属起始日。 */
function activeRange(timestamp: number, session: ScriptMarketSession, custom?: string, zone = session.timeZone) {
  const local = parts(timestamp, zone)
  for (const shift of [0, -1]) {
    const day = local.dayIndex + shift
    const dateTime = wall(day, 720, zone)
    const specification = custom ? customRanges(custom) : undefined
    if (specification && !specification.days.includes(String(new Date(day * DAY).getUTCDay() + 1))) continue
    for (const range of specification?.ranges ?? ranges(dateTime, session)) {
      const start = wall(day, range.open, zone)
      const end = wall(day, range.close, zone)
      if (timestamp >= start && timestamp < end) return { start, end, day, range }
    }
  }
  return undefined
}

/** 宿主时间入口：open/close返回周期边界，tradingday用于跨午夜分组，market等返回0/1。 */
export function timeValue(context: ScriptTimeContext | undefined, mode: string, period: string, timestamp: number, custom?: string, timezone?: string): number {
  if (!context) throw new Error('脚本时间API需要宿主提供图表周期和市场交易时段')
  if (!Number.isFinite(timestamp)) return Number.NaN
  const zone = timezone || context.session.timeZone
  const active = activeRange(timestamp, context.session, custom, zone)
  if (mode === 'market') return active ? 1 : 0
  if (mode === 'premarket' || mode === 'postmarket') {
    const selected = context.session[mode] ?? []
    return activeRange(timestamp, { ...context.session, sessions: selected }, undefined, zone) ? 1 : 0
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
    end = wall(Math.floor(Date.UTC(Math.floor((from + count) / 12), (from + count) % 12, 1) / DAY), 0, zone)
  } else {
    const span = unit === 'W' ? count * 7 : count
    const from = unit === 'W' ? Math.floor((tradingDay + 3) / span) * span - 3 : Math.floor(tradingDay / span) * span
    if (unit === 'D' && count === 1 && active) {
      const dailyRanges = custom ? customRanges(custom).ranges : ranges(wall(dayIndex, 720, zone), context.session)
      start = wall(dayIndex, dailyRanges[0]!.open, zone)
      end = wall(dayIndex, dailyRanges[dailyRanges.length - 1]!.close, zone)
    } else {
      start = wall(from, 0, zone)
      end = wall(from + span, 0, zone)
    }
  }
  return mode === 'close' ? end : start
}
