/**
 * 时间轴刻度：按 nice step 阶梯从时间区间生成日历边界，再吸附到逻辑槽位。
 *
 * 成本只与标签数相关，与可见槽位数无关：缩得越小步长越大，不会退化成逐槽扫描。
 * 日历边界在显示时区按可见区间中点的一次偏移换算（DST 边界最多 1 小时位置差），
 * 标签文本与落点使用同一偏移，二者始终自洽。
 */

import { isDailyPeriod, isIntradayPeriod } from '../../types/chartPeriod.js'
import type { TimeProjection, TimeTick, TimeTickUnit } from '../types.js'
import { DAY_MS, zoneOffsetMs } from './dtf.js'

/** 目标标签数：轴宽决定密度，下限保证窄轴也有刻度。 */
const MIN_TARGET = 3
const MAX_TARGET = 8
const PIXELS_PER_LABEL = 64

const DAY_LADDER = [1, 2, 7, 14, 28] as const
const MONTH_LADDER = [1, 2, 3, 4, 6, 12, 24, 36, 60, 120, 240] as const
const YEAR_LADDER = [1, 2, 3, 5, 10, 20, 50, 100] as const

const APPROX_MONTH_MS = 30 * DAY_MS
/** 日刻度的最大步长；再稀疏就改用月界，避免日期标签失去意义。 */
const MAX_DAY_STEP = 28
/** 吸附容差：只吸收浮点误差，不改变「下一条 K 线」的语义。 */
const SNAP_EPSILON = 1e-6
/** 防御性上限：异常槽距（如时间单位错配）不允许把一帧拖成长循环。 */
const MAX_BOUNDARIES = 4096

const EMPTY: readonly TimeTick[] = Object.freeze([])

/** 周期决定标签粒度：分钟/小时出日期，日线出月份，更高周期只出年份。 */
export function resolveTimeTickUnit(period: string | undefined): TimeTickUnit {
  if (isIntradayPeriod(period)) return 'day'
  if (isDailyPeriod(period)) return 'month'
  return 'year'
}

/** 轴宽决定标签密度；与可见槽位数无关。 */
export function resolveTimeTickTarget(widthPx: number): number {
  return Math.max(MIN_TARGET, Math.min(MAX_TARGET, Math.floor(widthPx / PIXELS_PER_LABEL)))
}

/** 刻度请求：`target` 省略表示枚举该单位的全部边界（网格线），否则按阶梯取标签密度。 */
export interface TimeTickRequest {
  readonly projection: TimeProjection
  /** 可见左界逻辑槽位（可为负，表示过去留白）。 */
  readonly firstIndex: number
  /** 可见右界逻辑槽位（可超过末根，表示未来留白）。 */
  readonly lastIndex: number
  readonly unit: TimeTickUnit
  readonly timeZone: string
  readonly target?: number
}

/** 取阶梯上不小于目标值的最小步长；超出阶梯尾部时按尾部整数倍延伸。 */
function pickStep(value: number, ladder: readonly number[]): number {
  for (const step of ladder) if (step >= value) return step
  const tail = ladder[ladder.length - 1]!
  return tail * Math.ceil(value / tail)
}

function monthIndexAt(zonedMs: number): number {
  const date = new Date(zonedMs)
  return date.getUTCFullYear() * 12 + date.getUTCMonth()
}

/** 时区空间里的整日边界；step 以天为单位。 */
function dayStarts(zFrom: number, zTo: number, step: number, limit: number): number[] {
  const starts: number[] = []
  const stride = step * DAY_MS
  const first = Math.ceil(zFrom / DAY_MS) * DAY_MS
  for (let start = first; start <= zTo && starts.length < limit; start += stride) starts.push(start)
  return starts
}

/** 时区空间里的整月边界；step 以月为单位，按年份取整保证对齐到 1 月。 */
function monthStarts(zFrom: number, zTo: number, step: number, limit: number): number[] {
  const from = new Date(zFrom)
  let cursor = from.getUTCFullYear() * 12 + from.getUTCMonth()
  if (Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1) < zFrom) cursor += 1
  cursor = Math.ceil(cursor / step) * step
  const starts: number[] = []
  for (; starts.length < limit; cursor += step) {
    const start = Date.UTC(Math.floor(cursor / 12), cursor % 12, 1)
    if (start > zTo) break
    starts.push(start)
  }
  return starts
}

/** 按单位与密度枚举时区空间中的日历边界。 */
function boundariesOf(
  zFrom: number,
  zTo: number,
  unit: TimeTickUnit,
  target: number | undefined,
): number[] {
  const limit = target === undefined ? MAX_BOUNDARIES : Math.max(2, Math.ceil(target * 4) + 4)
  if (unit === 'day') {
    const spanDays = (zTo - zFrom) / DAY_MS
    const step = target === undefined ? 1 : pickStep(spanDays / target, DAY_LADDER)
    if (step <= MAX_DAY_STEP) return dayStarts(zFrom, zTo, step, limit)
    const months = pickStep(spanDays / APPROX_MONTH_MS / (target ?? 1), MONTH_LADDER)
    return monthStarts(zFrom, zTo, months, limit)
  }
  const spanMonths = monthIndexAt(zTo) - monthIndexAt(zFrom) + 1
  if (unit === 'year') {
    const years = pickStep(Math.max(1, spanMonths / 12 / (target ?? 1)), YEAR_LADDER)
    return monthStarts(zFrom, zTo, years * 12, limit)
  }
  const months = target === undefined ? 1 : pickStep(Math.max(1, spanMonths / target), MONTH_LADDER)
  return monthStarts(zFrom, zTo, months, limit)
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** 标签与主刻度标记由吸附后的墙钟日期决定；年界始终是主刻度。 */
function createTick(index: number, time: number, offsetMs: number, unit: TimeTickUnit): TimeTick {
  const zoned = new Date(time + offsetMs)
  const year = zoned.getUTCFullYear()
  const month = zoned.getUTCMonth() + 1
  const day = zoned.getUTCDate()
  if (unit === 'year') return { index, time, label: String(year), major: true }
  if (unit === 'month') {
    return month === 1
      ? { index, time, label: String(year), major: true }
      : { index, time, label: `${month}月`, major: false }
  }
  const isYear = month === 1 && day === 1
  return {
    index,
    time,
    label: isYear ? `${year}-${pad2(month)}-${pad2(day)}` : `${pad2(month)}-${pad2(day)}`,
    major: isYear,
  }
}

/**
 * 生成一帧的时间轴刻度。
 *
 * @param request 可见槽位范围、单位、密度与显示时区
 * @returns 按槽位升序、互不重复的刻度；没有可推导时间时为空
 */
export function frameTimeTicks(request: TimeTickRequest): readonly TimeTick[] {
  const { projection, firstIndex, lastIndex, unit, timeZone, target } = request
  if (!Number.isFinite(firstIndex) || !Number.isFinite(lastIndex) || lastIndex < firstIndex)
    return EMPTY
  const from = projection.logicalToTime(firstIndex)
  const to = projection.logicalToTime(lastIndex)
  if (from === null || to === null || to <= from) return EMPTY

  const offsetMs = zoneOffsetMs((from + to) / 2, timeZone)
  const boundaries = boundariesOf(from + offsetMs, to + offsetMs, unit, target)
  const minIndex = Math.floor(firstIndex)
  const maxIndex = Math.ceil(lastIndex)
  const ticks: TimeTick[] = []
  let previousIndex = -1
  for (const boundary of boundaries) {
    const logical = projection.timeToLogical(boundary - offsetMs)
    if (logical === null) continue
    const index = Math.ceil(logical - SNAP_EPSILON)
    if (index < minIndex || index > maxIndex || index === previousIndex) continue
    const time = projection.logicalToTime(index)
    if (time === null) continue
    previousIndex = index
    ticks.push(createTick(index, time, offsetMs, unit))
  }
  return ticks
}
