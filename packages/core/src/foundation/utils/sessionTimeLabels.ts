/**
 * 开盘时段：minuteOfDay 为自 0 点起的分钟数（交易所本地墙钟）。
 * sessions[0..n-2] 左闭右开 [open, close)；sessions[n-1] 左闭右闭 [open, close]。
 * 只打印闭侧端点：半开段不展示 close。
 */
export type OpenTimeRange = {
  open: number
  close: number
}

/** 市场分时 session 配置（几何 / 标签共用） */
export type MarketSessionConfig = {
  /** IANA 时区，如 Asia/Shanghai */
  timeZone: string
  sessions: ReadonlyArray<OpenTimeRange>
  /** 每个 bar 槽对应的分钟数，默认 1 */
  slotMinutes?: number
}

export type SessionTimeLabel = {
  /** 自 0 点起的分钟数（交易所墙钟） */
  minuteOfDay: number
  /** 在展开后的槽序列中的索引（0-based） */
  slotIndex: number
  /** 是否为闭侧端点 */
  isEndpoint: boolean
}

export type SessionTimeLabelOptions = {
  axisWidth: number
  /** 保留字段，端点-only 模式下不参与密度计算 */
  minLabelSpacingPx?: number
}

function hm(h: number, m: number): number {
  return h * 60 + m
}

/** A 股默认 */
export const ASHARE_OPEN_SESSIONS: readonly OpenTimeRange[] = [
  { open: hm(9, 30), close: hm(11, 30) },
  { open: hm(13, 0), close: hm(15, 0) },
]

export const ASHARE_MARKET_SESSION: MarketSessionConfig = {
  timeZone: 'Asia/Shanghai',
  sessions: ASHARE_OPEN_SESSIONS,
  slotMinutes: 1,
}

/** 港股 */
export const HK_MARKET_SESSION: MarketSessionConfig = {
  timeZone: 'Asia/Hong_Kong',
  sessions: [
    { open: hm(9, 30), close: hm(12, 0) },
    { open: hm(13, 0), close: hm(16, 0) },
  ],
  slotMinutes: 1,
}

/** 美股（常规盘，无午休） */
export const US_MARKET_SESSION: MarketSessionConfig = {
  timeZone: 'America/New_York',
  sessions: [{ open: hm(9, 30), close: hm(16, 0) }],
  slotMinutes: 1,
}

/**
 * 只输出各区间闭侧端点。
 * - 非末段 [open, close)：仅 open
 * - 末段 [open, close]：open 与 close
 * close 标签映射到 close-1 槽（bar 序列为各段 [open, close)）。
 */
export function computeSessionTimeLabels(
  sessions: ReadonlyArray<OpenTimeRange>,
  options: SessionTimeLabelOptions,
): SessionTimeLabel[] {
  if (!(options.axisWidth > 0) || sessions.length === 0) return []

  const labels: SessionTimeLabel[] = []
  let slotOffset = 0

  for (let s = 0; s < sessions.length; s++) {
    const range = sessions[s]!
    if (!(range.close > range.open)) continue
    const slotCount = range.close - range.open
    const isLast = s === sessions.length - 1

    labels.push({
      minuteOfDay: range.open,
      slotIndex: slotOffset,
      isEndpoint: true,
    })

    if (isLast) {
      labels.push({
        minuteOfDay: range.close,
        slotIndex: slotOffset + slotCount - 1,
        isEndpoint: true,
      })
    }

    slotOffset += slotCount
  }

  const bySlot = new Map<number, SessionTimeLabel>()
  for (const label of labels) {
    bySlot.set(label.slotIndex, label)
  }
  return [...bySlot.values()].sort((a, b) => a.slotIndex - b.slotIndex)
}

/** 槽总数（各段 [open, close) 分钟数之和；未除 slotMinutes） */
export function countSessionSlots(sessions: ReadonlyArray<OpenTimeRange>): number {
  let n = 0
  for (const r of sessions) {
    if (r.close > r.open) n += r.close - r.open
  }
  return n
}

/**
 * 全天 bar 槽数 = 分钟总和 / slotMinutes。
 * sessions 为 SSOT，不因 arrivedCount 放大。
 */
export function resolveMarketSessionSlots(
  config: MarketSessionConfig,
  _arrivedCount?: number,
): number {
  const minutes = countSessionSlots(config.sessions)
  const step = config.slotMinutes && config.slotMinutes > 0 ? config.slotMinutes : 1
  return Math.max(0, Math.floor(minutes / step))
}

/** 将实际交易时间映射到 session 槽位。非末段收盘点落在下一时段共享的边界槽。 */
export function resolveTimestampSessionSlot(
  timestamp: number,
  config: MarketSessionConfig = ASHARE_MARKET_SESSION,
): number | null {
  if (!Number.isFinite(timestamp)) return null

  if (Number.isNaN(new Date(timestamp).getTime())) return null

  const wall = getWallClockInTimeZone(timestamp, config.timeZone)
  const minuteOfDay = wall.hour * 60 + wall.minute
  const step = config.slotMinutes && config.slotMinutes > 0 ? config.slotMinutes : 1
  let offset = 0

  for (let i = 0; i < config.sessions.length; i++) {
    const range = config.sessions[i]!
    const slotCount = Math.floor((range.close - range.open) / step)
    if (slotCount <= 0) continue
    if (minuteOfDay >= range.open && minuteOfDay < range.close) {
      return offset + Math.floor((minuteOfDay - range.open) / step)
    }
    if (minuteOfDay === range.close) {
      return offset + (i === config.sessions.length - 1 ? slotCount - 1 : slotCount)
    }
    offset += slotCount
  }
  return null
}

/**
 * 将交易所墙钟 minuteOfDay 转为 UTC 毫秒。
 * baseTimestamp 用于确定「哪一天」（按 timeZone 日历日）。
 */
export function minuteOfDayToTimestamp(
  baseTimestamp: number,
  minuteOfDay: number,
  timeZone: string = 'Asia/Shanghai',
): number {
  const { year, month, day } = getCalendarPartsInTimeZone(baseTimestamp, timeZone)
  return zonedWallTimeToUtc(year, month, day, minuteOfDay, timeZone)
}

/** 槽中心 X */
export function sessionSlotCenterX(
  slotIndex: number,
  axisWidth: number,
  sessionSlots: number,
  dpr: number,
): number {
  if (!(axisWidth > 0) || !(sessionSlots > 0)) return 0
  const step = axisWidth / sessionSlots
  return Math.round((slotIndex + 0.5) * step * dpr) / dpr
}

// ── 时区工具（无第三方依赖，Intl） ──

function getCalendarPartsInTimeZone(
  timestamp: number,
  timeZone: string,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp))
  let year = 0
  let month = 1
  let day = 1
  for (const p of parts) {
    if (p.type === 'year') year = Number(p.value)
    else if (p.type === 'month') month = Number(p.value)
    else if (p.type === 'day') day = Number(p.value)
  }
  return { year, month, day }
}

/**
 * 将某时区墙钟 (y-m-d + minuteOfDay) 转为 UTC epoch。
 * 用迭代修正 UTC 猜测，覆盖 DST。
 */
function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  minuteOfDay: number,
  timeZone: string,
): number {
  const hour = Math.floor(minuteOfDay / 60)
  const minute = minuteOfDay % 60
  // 初值：当作 UTC 墙钟
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0, 0)
  for (let i = 0; i < 4; i++) {
    const wall = getWallClockInTimeZone(utc, timeZone)
    const desiredMin = hour * 60 + minute
    const actualMin = wall.hour * 60 + wall.minute
    const dayDelta =
      Date.UTC(year, month - 1, day) - Date.UTC(wall.year, wall.month - 1, wall.day)
    const minDelta = desiredMin - actualMin + dayDelta / 60_000
    if (minDelta === 0) break
    utc += minDelta * 60_000
  }
  return utc
}

function getWallClockInTimeZone(
  timestamp: number,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp))
  let year = 0
  let month = 1
  let day = 1
  let hour = 0
  let minute = 0
  for (const p of parts) {
    if (p.type === 'year') year = Number(p.value)
    else if (p.type === 'month') month = Number(p.value)
    else if (p.type === 'day') day = Number(p.value)
    else if (p.type === 'hour') hour = Number(p.value)
    else if (p.type === 'minute') minute = Number(p.value)
  }
  return { year, month, day, hour, minute }
}
