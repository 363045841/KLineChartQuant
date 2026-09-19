export type DisplayTimeZoneSetting = 'UTC' | 'local'

export type AxisDateLabel = { text: string; isYear: boolean }
type Timestamped = { timestamp: number }

export interface DisplayTimeFormatter {
  readonly timeZone: string
  formatDate(timestamp: number): string
  formatDateTime(timestamp: number): string
  formatAxisMonthOrYear(timestamp: number): AxisDateLabel
  formatAxisDay(timestamp: number): AxisDateLabel
  getMonthBoundaries(data: ReadonlyArray<Timestamped>): ReadonlyArray<number>
  getDayBoundaries(data: ReadonlyArray<Timestamped>): ReadonlyArray<number>
}

export interface MarketSessionTimeFormatter {
  readonly timeZone: string
  formatAxisTime(timestamp: number): string
}

type DateParts = { year: string; month: string; day: string; hour?: string; minute?: string }
type KeyIndex = { length: number; first: number; last: number; month: Int32Array; day: Int32Array }

const DATE_CACHE_LIMIT = 1024
const AXIS_CACHE_LIMIT = 512
const standaloneFormatters = new Map<string, DisplayTimeFormatter>()

/** 在渲染高频路径外，一次性解析持久化的显示时区偏好。 */
export function resolveDisplayTimeZone(setting: DisplayTimeZoneSetting): string {
  if (setting === 'UTC') return 'UTC'
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * 为图表显示时区创建完整的日期格式化上下文。
 * Intl formatter 仅在此构造，坐标轴绘制时绝不构造。
 */
export function createDisplayTimeFormatter(timeZone: string): DisplayTimeFormatter {
  const dateFormatter = createPartsFormatter(timeZone)
  const dateTimeFormatter = createPartsFormatter(timeZone, true)
  const dateCache = new Map<number, string>()
  const dateTimeCache = new Map<number, string>()
  const monthAxisCache = new Map<number, AxisDateLabel>()
  const dayAxisCache = new Map<number, AxisDateLabel>()
  const keyIndexes = new WeakMap<ReadonlyArray<Timestamped>, KeyIndex>()

  const partsAt = (timestamp: number, withTime = false): DateParts =>
    readParts(withTime ? dateTimeFormatter : dateFormatter, timestamp)

  const indexFor = (data: ReadonlyArray<Timestamped>): KeyIndex => {
    const first = data[0]?.timestamp ?? 0
    const last = data[data.length - 1]?.timestamp ?? 0
    const cached = keyIndexes.get(data)
    if (cached && cached.length === data.length && cached.first === first && cached.last === last) return cached

    const month = new Int32Array(data.length)
    const day = new Int32Array(data.length)
    for (let index = 0; index < data.length; index++) {
      const parts = partsAt(data[index]!.timestamp)
      const year = Number(parts.year)
      const monthNumber = Number(parts.month)
      month[index] = year * 12 + monthNumber - 1
      day[index] = year * 10_000 + monthNumber * 100 + Number(parts.day)
    }
    const next = { length: data.length, first, last, month, day }
    keyIndexes.set(data, next)
    return next
  }

  const boundariesFor = (data: ReadonlyArray<Timestamped>, kind: 'month' | 'day'): ReadonlyArray<number> => {
    if (data.length === 0) return []
    const keys = indexFor(data)[kind]
    const boundaries = [0]
    let previous = keys[0]
    for (let index = 1; index < keys.length; index++) {
      if (keys[index] !== previous) {
        boundaries.push(index)
        previous = keys[index]
      }
    }
    return boundaries
  }

  return {
    timeZone,
    formatDate(timestamp) {
      return getOrCreate(dateCache, timestamp, DATE_CACHE_LIMIT, () => {
        const { year, month, day } = partsAt(timestamp)
        return `${year}-${month}-${day}`
      })
    },
    formatDateTime(timestamp) {
      return getOrCreate(dateTimeCache, timestamp, DATE_CACHE_LIMIT, () => {
        const { year, month, day, hour, minute } = partsAt(timestamp, true)
        return `${year}-${month}-${day} ${hour}:${minute}`
      })
    },
    formatAxisMonthOrYear(timestamp) {
      return getOrCreate(monthAxisCache, timestamp, AXIS_CACHE_LIMIT, () => {
        const { year, month } = partsAt(timestamp)
        return month === '01' ? { text: year, isYear: true } : { text: `${Number(month)}月`, isYear: false }
      })
    },
    formatAxisDay(timestamp) {
      return getOrCreate(dayAxisCache, timestamp, AXIS_CACHE_LIMIT, () => {
        const { year, month, day } = partsAt(timestamp)
        const isYear = month === '01' && day === '01'
        return { text: isYear ? `${year}-${month}-${day}` : `${month}-${day}`, isYear }
      })
    },
    getMonthBoundaries(data) {
      return boundariesFor(data, 'month')
    },
    getDayBoundaries(data) {
      return boundariesFor(data, 'day')
    },
  }
}

/** 使用明确的 IANA 时区格式化非渲染用途的日期时间文本。 */
export function formatDateTimeInTimeZone(timestamp: number, timeZone = 'Asia/Shanghai'): string {
  let formatter = standaloneFormatters.get(timeZone)
  if (!formatter) {
    formatter = createDisplayTimeFormatter(timeZone)
    standaloneFormatters.set(timeZone, formatter)
  }
  return formatter.formatDateTime(timestamp)
}

/** 使用明确的时区格式化独立文本，不进入图表渲染状态。 */
export function formatTimeInTimeZone(
  timestamp: number,
  options: { timeZone: string; showTime: boolean },
): string {
  let formatter = standaloneFormatters.get(options.timeZone)
  if (!formatter) {
    formatter = createDisplayTimeFormatter(options.timeZone)
    standaloneFormatters.set(options.timeZone, formatter)
  }
  return options.showTime ? formatter.formatDateTime(timestamp) : formatter.formatDate(timestamp)
}

/** 创建仅供分时市场时段标签使用的独立 formatter。 */
export function createMarketSessionTimeFormatter(timeZone: string): MarketSessionTimeFormatter {
  const formatter = createPartsFormatter(timeZone, true)
  const cache = new Map<number, string>()
  return {
    timeZone,
    formatAxisTime(timestamp) {
      return getOrCreate(cache, timestamp, AXIS_CACHE_LIMIT, () => {
        const { hour, minute } = readParts(formatter, timestamp)
        return `${hour}:${minute}`
      })
    },
  }
}

function createPartsFormatter(timeZone: string, withTime = false): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const } : {}),
  })
}

function readParts(formatter: Intl.DateTimeFormat, timestamp: number): DateParts {
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

function getOrCreate<T>(cache: Map<number, T>, key: number, limit: number, create: () => T): T {
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  if (cache.size >= limit) cache.clear()
  const value = create()
  cache.set(key, value)
  return value
}
