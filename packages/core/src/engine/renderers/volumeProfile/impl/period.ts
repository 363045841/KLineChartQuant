/**
 * 按阶段切分 K 线，为每一段生成一个成交量分布的绘制区间。
 *
 * 阶段单位支持「每 N 根 K 线」「每 N 天/周/月」；日、周、月按行情会话时区取自然边界，
 * 小时级别的 K 线不会被跨日错误归并。切出的段数以截面为单位，超过上限只保留最近的段。
 */
import type { KLineData } from '../../../../foundation/types/price.js'
import type { VolumeProfilePeriodUnit, VolumeProfileSlice } from '../types.js'
import { MAX_PROFILE_SLICES } from '../types.js'

/** 时区日期解析器缓存：同一时区只创建一次 Intl 实例。 */
const dateFormatters = new Map<string, Intl.DateTimeFormat>()

/** 取某时区下的日期格式器。 */
function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = dateFormatters.get(timeZone)
  if (cached !== undefined) return cached
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  dateFormatters.set(timeZone, formatter)
  return formatter
}

/** 取某时区下的自然日序号（自 1970-01-01 起的天数）。 */
function zonedDayIndex(timestamp: number, timeZone: string): number {
  const parts = dateFormatter(timeZone).formatToParts(timestamp)
  let year = 0
  let month = 0
  let day = 0
  for (const part of parts) {
    if (part.type === 'year') year = Number(part.value)
    else if (part.type === 'month') month = Number(part.value)
    else if (part.type === 'day') day = Number(part.value)
  }
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

/** 取某时区下的自然月序号（自 1970-01 起的月数）。 */
function zonedMonthIndex(timestamp: number, timeZone: string): number {
  const parts = dateFormatter(timeZone).formatToParts(timestamp)
  let year = 0
  let month = 0
  for (const part of parts) {
    if (part.type === 'year') year = Number(part.value)
    else if (part.type === 'month') month = Number(part.value)
  }
  return year * 12 + (month - 1)
}

/** 取某时区下的自然周序号（周一为一周起点）。 */
function zonedWeekIndex(timestamp: number, timeZone: string): number {
  const dayIndex = zonedDayIndex(timestamp, timeZone)
  // 1970-01-01 是周四：以周一为起点偏移 3 天后整除 7。
  return Math.floor((dayIndex + 3) / 7)
}

/** 取阶段键：同一键的 K 线属于同一段。 */
function periodKey(timestamp: number, unit: VolumeProfilePeriodUnit, timeZone: string): number {
  if (unit === 'day') return zonedDayIndex(timestamp, timeZone)
  if (unit === 'week') return zonedWeekIndex(timestamp, timeZone)
  return zonedMonthIndex(timestamp, timeZone)
}

/** 把连续 K 线按原生阶段切成最小分段（每段键相同）。 */
function naturalSlices(
  bars: ReadonlyArray<KLineData>,
  unit: VolumeProfilePeriodUnit,
  timeZone: string,
): VolumeProfileSlice[] {
  const slices: VolumeProfileSlice[] = []
  let startIndex = 0
  let currentKey = periodKey(bars[0].timestamp, unit, timeZone)
  for (let index = 1; index < bars.length; index += 1) {
    const key = periodKey(bars[index].timestamp, unit, timeZone)
    if (key === currentKey) continue
    slices.push({ startIndex, endIndex: index - 1 })
    startIndex = index
    currentKey = key
  }
  slices.push({ startIndex, endIndex: bars.length - 1 })
  return slices
}

/**
 * 解析绘制区间。
 *
 * @param bars 升序 K 线序列。
 * @param unit 阶段单位。
 * @param count 每段包含的原生阶段数；`candle` 单位下表示每段 K 线根数。
 * @param timeZone 行情会话时区，用于确定日/周/月边界。
 * @returns 自早到晚的闭区间列表；超过 `MAX_PROFILE_SLICES` 时只保留最近的段。
 */
export function resolveVolumeProfileSlices(
  bars: ReadonlyArray<KLineData>,
  unit: VolumeProfilePeriodUnit,
  count: number,
  timeZone: string,
): VolumeProfileSlice[] {
  if (bars.length === 0) return []
  const size = Math.max(1, Math.floor(count))

  if (unit === 'candle') {
    const slices: VolumeProfileSlice[] = []
    for (let startIndex = 0; startIndex < bars.length; startIndex += size) {
      slices.push({ startIndex, endIndex: Math.min(startIndex + size - 1, bars.length - 1) })
    }
    return slices.slice(-MAX_PROFILE_SLICES)
  }

  const natural = naturalSlices(bars, unit, timeZone)
  const slices: VolumeProfileSlice[] = []
  for (let index = 0; index < natural.length; index += size) {
    const first = natural[index]
    const last = natural[Math.min(index + size - 1, natural.length - 1)]
    slices.push({ startIndex: first.startIndex, endIndex: last.endIndex })
  }
  return slices.slice(-MAX_PROFILE_SLICES)
}
