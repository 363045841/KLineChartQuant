/**
 * Intl 时间基础：按用途复用的 formatter 只在此构造，时区偏移在此换算。
 *
 * 不缓存格式化结果：标签数量由刻度阶梯决定，单次 format 的成本不再进入帧预算。
 */

export const DAY_MS = 86_400_000

/** `formatToParts` 的日期字段；缺省字段表示该 formatter 不输出时分。 */
export interface DateParts {
  year: string
  month: string
  day: string
  hour?: string
  minute?: string
}

/** 时区解析器只用于把墙钟字段解析回数字，固定 en-US 避免本地化数字破坏算术。 */
const zoneParsers = new Map<string, Intl.DateTimeFormat | null>()

function zoneParser(timeZone: string): Intl.DateTimeFormat | null {
  const cached = zoneParsers.get(timeZone)
  if (cached !== undefined) return cached
  let parser: Intl.DateTimeFormat | null
  try {
    parser = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    parser = null
  }
  zoneParsers.set(timeZone, parser)
  return parser
}

/** 只取 formatter 已输出的日期字段；缺字段保持 undefined，不做默认值回退。 */
export function readParts(formatter: Intl.DateTimeFormat, timestamp: number): DateParts {
  const result: DateParts = { year: '', month: '', day: '' }
  for (const part of formatter.formatToParts(timestamp)) {
    if (part.type === 'year') result.year = part.value
    else if (part.type === 'month') result.month = part.value
    else if (part.type === 'day') result.day = part.value
    else if (part.type === 'hour') result.hour = part.value
    else if (part.type === 'minute') result.minute = part.value
  }
  return result
}

/**
 * 该时区在 `timestamp` 时刻相对 UTC 的偏移（毫秒）；UTC 或未知时区返回 0。
 *
 * @param timestamp 真实毫秒时间戳
 * @param timeZone IANA 时区标识
 */
export function zoneOffsetMs(timestamp: number, timeZone: string): number {
  if (!timeZone || timeZone === 'UTC') return 0
  const parser = zoneParser(timeZone)
  if (!parser) return 0
  const parts = parser.formatToParts(timestamp)
  const field = (type: string): number => Number(parts.find((part) => part.type === type)?.value)
  const wallClock = Date.UTC(
    field('year'),
    field('month') - 1,
    field('day'),
    field('hour') % 24,
    field('minute'),
    field('second'),
  )
  return wallClock - timestamp
}
