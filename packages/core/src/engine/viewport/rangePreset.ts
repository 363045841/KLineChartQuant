/**
 * 时间范围预置：把「最近 N 天 / 年初至今 / 全部」解析成时间窗、可视根数与目标帧。
 *
 * 纯函数模块，不持有状态：数据层只负责把窗口内的数据装进池子，视口层只负责把窗口
 * 装进屏幕。预置本身只做时间到槽位的换算，不触发任何加载或定位。
 */

import type { KLinePeriod } from '../../data/provider/types.js'
import { KLinePeriod as Period } from '../../data/provider/types.js'
import { readParts, zoneOffsetMs } from '../../foundation/time/impl/dtf.js'
import { LATEST_RIGHT_MARGIN_BARS } from '../scale/impl/scale_X/scaleXStrategies.js'

/** 可选的时间范围预置。 */
export type RangePreset = '1D' | '7D' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '5Y' | 'ALL'

/** 左下栏按钮顺序；展示与匹配共用同一份顺序。 */
export const RANGE_PRESETS: readonly RangePreset[] = Object.freeze([
  '1D',
  '7D',
  '1M',
  '3M',
  '6M',
  'YTD',
  '1Y',
  '5Y',
  'ALL',
])

const DAY_MS = 86_400_000

/** 以「最后一根 K 线」为终点向前推的固定跨度。 */
const PRESET_SPAN_MS: Readonly<Record<Exclude<RangePreset, 'YTD' | 'ALL'>, number>> = {
  '1D': DAY_MS,
  '7D': 7 * DAY_MS,
  '1M': 30 * DAY_MS,
  '3M': 90 * DAY_MS,
  '6M': 180 * DAY_MS,
  '1Y': 365 * DAY_MS,
  '5Y': 5 * 365 * DAY_MS,
}

/** 一个周期在自然时间里占用的长度，用于挑周期时的根数估算。 */
const PERIOD_SPAN_MS: Readonly<Record<KLinePeriod, number>> = {
  [Period.Min1]: 60_000,
  [Period.Min5]: 5 * 60_000,
  [Period.Min15]: 15 * 60_000,
  [Period.Min30]: 30 * 60_000,
  [Period.Min60]: 3_600_000,
  [Period.Hour4]: 4 * 3_600_000,
  [Period.Daily]: DAY_MS,
  [Period.Weekly]: 7 * DAY_MS,
  [Period.Monthly]: 30 * DAY_MS,
  [Period.Quarterly]: 90 * DAY_MS,
  [Period.Yearly]: 365 * DAY_MS,
}

/** 一个窗口最多在屏幕上放多少根；超过就换更粗的周期，保证蜡烛还能读。 */
export const RANGE_MAX_VISIBLE_BARS = 800

/** 需要定位的时间窗（闭区间，epoch 毫秒）。 */
export interface RangeWindow {
  readonly from: number
  readonly to: number
}

/** 几何无关的帧目标：连续缩放档位 + 首根所在槽位。 */
export interface RangeFrame {
  readonly level: number
  readonly anchorSlot: number
}

/** 只读取时间戳的最小 K 线形状，避免预置模块依赖完整行情结构。 */
export interface TimestampedBar {
  readonly timestamp: number
}

/**
 * 该时区在 `timestamp` 所在年份的 1 月 1 日 0 点（epoch 毫秒）。
 *
 * @param timestamp 参考时刻
 * @param timeZone IANA 时区
 * @returns 该时区当年的开始时刻
 */
function startOfYearInTimeZone(timestamp: number, timeZone: string): number {
  const zoned = readParts(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' }),
    timestamp,
  )
  const year = Number(zoned.year)
  const wallClock = Date.UTC(year, 0, 1)
  return wallClock - zoneOffsetMs(wallClock, timeZone)
}

/**
 * 把预置解析成以最后一根 K 线为终点的时间窗。
 *
 * @param preset 预置
 * @param bars 当前已加载的 K 线（按时间升序）
 * @param timeZone 图表显示时区，`YTD` 用它确定「年初」
 * @returns 时间窗；没有数据时返回 null
 */
export function resolveRangeWindow(
  preset: RangePreset,
  bars: readonly TimestampedBar[],
  timeZone: string,
): RangeWindow | null {
  const first = bars[0]
  const last = bars[bars.length - 1]
  if (!first || !last) return null
  if (preset === 'ALL') return { from: first.timestamp, to: last.timestamp }
  const from =
    preset === 'YTD'
      ? startOfYearInTimeZone(last.timestamp, timeZone)
      : last.timestamp - PRESET_SPAN_MS[preset]
  return { from: Math.max(first.timestamp, from), to: last.timestamp }
}

/**
 * 窗口中第一根 K 线的数据索引。
 *
 * @param preset 预置
 * @param bars 已加载 K 线（升序）
 * @param timeZone 图表显示时区
 * @returns 起始索引；没有数据时为 null
 */
function presetStartIndex(
  preset: RangePreset,
  bars: readonly TimestampedBar[],
  timeZone: string,
): number | null {
  const window = resolveRangeWindow(preset, bars, timeZone)
  if (!window) return null
  let low = 0
  let high = bars.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (bars[middle]!.timestamp < window.from) low = middle + 1
    else high = middle
  }
  return low < bars.length ? low : bars.length - 1
}

/**
 * 为一个窗口挑选周期：在品种支持的周期里选最细的、且窗口内根数不超过可读上限的那个。
 *
 * 唯一输入是窗口的真实跨度，不做任何预置到周期的映射；全部周期都放不下时用最粗的一个。
 *
 * @param supported 品种支持的 K 线周期
 * @param spanMs 窗口的真实跨度（毫秒）
 * @returns 目标周期；窗口跨度为非正数时为 null
 */
export function pickRangePeriod(
  supported: readonly KLinePeriod[],
  spanMs: number,
): KLinePeriod | null {
  if (!(spanMs > 0) || supported.length === 0) return null
  const ordered = [...supported].sort((a, b) => PERIOD_SPAN_MS[a] - PERIOD_SPAN_MS[b])
  for (const period of ordered) {
    if (spanMs / PERIOD_SPAN_MS[period] <= RANGE_MAX_VISIBLE_BARS) return period
  }
  return ordered[ordered.length - 1]!
}

/**
 * 最粗的支持周期，用于探测完整历史跨度。
 *
 * @param supported 品种支持的 K 线周期
 * @returns 最粗周期；没有支持周期时为 null
 */
export function coarsestPeriod(supported: readonly KLinePeriod[]): KLinePeriod | null {
  if (supported.length === 0) return null
  return [...supported].sort((a, b) => PERIOD_SPAN_MS[b] - PERIOD_SPAN_MS[a])[0]!
}

/**
 * 第一条时间不早于 `timestamp` 的 K 线索引。
 *
 * @param bars 已加载 K 线（升序）
 * @param timestamp 目标时间
 * @returns 索引；全部早于目标时为 null
 */
export function indexAtOrAfter(bars: readonly TimestampedBar[], timestamp: number): number | null {
  let low = 0
  let high = bars.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (bars[middle]!.timestamp < timestamp) low = middle + 1
    else high = middle
  }
  return low < bars.length ? low : null
}

/**
 * 最后一条时间不晚于 `timestamp` 的 K 线索引。
 *
 * @param bars 已加载 K 线（升序）
 * @param timestamp 目标时间
 * @returns 索引；全部晚于目标时为 null
 */
export function indexAtOrBefore(bars: readonly TimestampedBar[], timestamp: number): number | null {
  let low = 0
  let high = bars.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (bars[middle]!.timestamp <= timestamp) low = middle + 1
    else high = middle
  }
  return low > 0 ? low - 1 : null
}

/** 计算帧目标所需的输入。 */
export interface WindowFrameInput {
  /** 窗口首根的数据索引。 */
  readonly startIndex: number
  /** 窗口内根数。 */
  readonly barCount: number
  readonly plotWidth: number
  readonly gapRatio: number
  readonly minKWidth: number
  readonly maxKWidth: number
  readonly zoomLevelCount: number
}

/**
 * 计算把窗口装进屏幕所需的连续档位与首槽位。
 *
 * 槽距是唯一自由度：`step = 宽度 / 根数`，再由实体与间距系数反解 K 线宽度，
 * 最后线性映射到缩放档位。放不下时按最小宽度截断，窗口只展示能放下的部分。
 *
 * @param input 窗口位置、绘图宽度与缩放配置
 * @returns 帧目标；输入无效时为 null
 */
export function resolveWindowFrame(input: WindowFrameInput): RangeFrame | null {
  const { plotWidth, minKWidth, maxKWidth, zoomLevelCount, gapRatio } = input
  if (!(plotWidth > 0) || !(maxKWidth > minKWidth) || zoomLevelCount < 2) return null
  if (input.barCount <= 0) return null
  const slots = input.barCount + LATEST_RIGHT_MARGIN_BARS + 0.5
  const step = plotWidth / slots
  const kWidth = Math.min(maxKWidth, Math.max(minKWidth, step / (1 + Math.max(0, gapRatio))))
  const progress = (kWidth - minKWidth) / (maxKWidth - minKWidth)
  return {
    level: 1 + progress * (zoomLevelCount - 1),
    anchorSlot: input.startIndex - 0.5,
  }
}

/** 判断当前可见窗口是否正好是某个预置。 */
export interface ActiveRangeInput {
  readonly bars: readonly TimestampedBar[]
  readonly visibleFrom: number
  readonly visibleTo: number
  readonly timeZone: string
}

/**
 * 可见区间比真实首尾各扩一根用于渲染，加上首槽位落在半槽处，命中判定的起点差最多两根。
 */
const RANGE_MATCH_TOLERANCE_BARS = 2

/**
 * 由真实可见窗口反推命中的预置，供按钮高亮直接消费。
 *
 * 命中条件：右端停在最新一根，且窗口起点与预置起点相差不超过渲染扩窗的量。平移、缩放或
 * 手动改周期都会让条件不成立，高亮随之消失，不需要额外的点击状态。
 *
 * @param input 可见索引区间、数据与显示时区
 * @returns 命中的预置；不匹配任何预置时为 null
 */
export function matchActiveRangePreset(input: ActiveRangeInput): RangePreset | null {
  const { bars, visibleFrom, visibleTo } = input
  if (bars.length === 0 || visibleTo < bars.length) return null
  // 全部数据都在屏内时先命中 ALL；否则浅历史下永远只能高亮最深的那个跨度。
  if (visibleFrom <= RANGE_MATCH_TOLERANCE_BARS) return 'ALL'
  for (const preset of RANGE_PRESETS) {
    if (preset === 'ALL') continue
    const start = presetStartIndex(preset, bars, input.timeZone)
    if (start === null) continue
    if (Math.abs(visibleFrom - start) <= RANGE_MATCH_TOLERANCE_BARS) return preset
  }
  return null
}
