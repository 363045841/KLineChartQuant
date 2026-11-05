/** 分时（单日与五日）共用的帧级横向几何。 */
import type {
  TimeShareDayGeometry,
  TimeShareGeometry,
  TimeShareSegmentGeometry,
} from '@/foundation/plugin/index.js'
import {
  type MarketSessionConfig,
  resolveMarketSessionSlots,
  resolveTimestampSessionSlot,
} from '@/foundation/utils/timeShareAxisLabels.js'
import { computeTimeShareXLayout } from './timeShareMath.js'

/** 单个交易日的点列；单日视图只提供一组。 */
export interface TimeShareGeometryDayInput {
  tradingDate?: string
  data: ReadonlyArray<{ timestamp: number }>
}

export interface TimeShareGeometryInput {
  days: ReadonlyArray<TimeShareGeometryDayInput>
  marketSession: MarketSessionConfig
  contentWidth: number
  dpr: number
}

export interface TimeShareFrameGeometry {
  geometry: TimeShareGeometry
  centers: number[]
  kWidthPx: number
}

type DayRange = { start: number; end: number }

/** 把每个点映射为全窗口槽位；无法解析时间戳的点标记为 null。 */
function resolveSlotIndices(
  days: ReadonlyArray<TimeShareGeometryDayInput>,
  sessionSlots: number,
  marketSession: MarketSessionConfig,
): Array<number | null> {
  const slots: Array<number | null> = []
  for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
    for (const point of days[dayIndex]!.data) {
      const slot = resolveTimestampSessionSlot(point.timestamp, marketSession)
      slots.push(slot === null ? null : dayIndex * sessionSlots + slot)
    }
  }
  return slots
}

/** 追加一段连续槽位；段内首尾必有有效落点。 */
function pushSegment(
  target: TimeShareSegmentGeometry[],
  start: number,
  end: number,
  centers: ReadonlyArray<number>,
): void {
  target.push(
    Object.freeze({
      dataStartIndex: start,
      dataEndIndex: end,
      startX: centers[start]!,
      endX: centers[end - 1]!,
    }),
  )
}

/** 单个交易日内的连续槽位段状态。 */
interface SegmentState {
  segments: TimeShareSegmentGeometry[]
  segmentStart: number
  previousSlot: number | null
}

/** 追加一个槽位；空槽位与跳槽都会切段。 */
function appendSlot(
  state: SegmentState,
  index: number,
  slot: number | null,
  centers: ReadonlyArray<number>,
): void {
  if (slot === null) {
    if (state.segmentStart >= 0) {
      pushSegment(state.segments, state.segmentStart, index, centers)
    }
    state.segmentStart = -1
    state.previousSlot = null
    return
  }
  if (state.segmentStart < 0) {
    state.segmentStart = index
  } else if (state.previousSlot === null || slot !== state.previousSlot + 1) {
    pushSegment(state.segments, state.segmentStart, index, centers)
    state.segmentStart = index
  }
  state.previousSlot = slot
}

/** 只在槽位连续时连线；空槽位、跳槽与交易日边界都切段。 */
function buildSegments(
  dayRanges: ReadonlyArray<DayRange>,
  slots: ReadonlyArray<number | null>,
  centers: ReadonlyArray<number>,
): TimeShareSegmentGeometry[] {
  const segments: TimeShareSegmentGeometry[] = []
  for (const { start, end } of dayRanges) {
    const state: SegmentState = { segments, segmentStart: -1, previousSlot: null }
    for (let index = start; index < end; index++) {
      appendSlot(state, index, slots[index] ?? null, centers)
    }
    if (state.segmentStart >= 0) pushSegment(segments, state.segmentStart, end, centers)
  }
  return segments
}

/**
 * 生成单日与五日共用的横向几何：点列按 session 槽位落位，按连续性切段。
 * @returns 帧级几何与逐点中心；无有效点时返回 null
 */
export function computeTimeShareGeometry(
  input: TimeShareGeometryInput,
): TimeShareFrameGeometry | null {
  const { days, marketSession, contentWidth, dpr } = input
  const sessionSlots = resolveMarketSessionSlots(marketSession)
  const totalSlots = sessionSlots * days.length
  if (days.length === 0 || totalSlots <= 0 || contentWidth <= 0 || !(dpr > 0)) return null

  const slots = resolveSlotIndices(days, sessionSlots, marketSession)
  if (slots.length === 0) return null

  const layout = computeTimeShareXLayout({
    arrivedCount: slots.length,
    sessionSlots: totalSlots,
    totalWidth: contentWidth,
    dpr,
    slotIndices: slots,
  })
  if (!layout) return null

  const dayRanges: DayRange[] = []
  let offset = 0
  for (const day of days) {
    dayRanges.push({ start: offset, end: offset + day.data.length })
    offset += day.data.length
  }

  // 单日没有日间分隔线，几何覆盖整个内容宽度，基准线才能铺满画布；多日按槽位带对齐。
  const singleDay = days.length === 1
  const dayGeometry: TimeShareDayGeometry[] = days.map((day, dayIndex) => {
    const bandStartX = layout.offset + dayIndex * sessionSlots * layout.step
    const bandEndX = layout.offset + (dayIndex + 1) * sessionSlots * layout.step
    const startX = singleDay ? 0 : bandStartX
    const endX = singleDay ? contentWidth : bandEndX
    return {
      ...(day.tradingDate === undefined ? {} : { tradingDate: day.tradingDate }),
      dataStartIndex: dayRanges[dayIndex]!.start,
      dataEndIndex: dayRanges[dayIndex]!.end,
      startX,
      endX,
      labelX: (startX + endX) / 2,
      ...(dayIndex > 0 ? { separatorX: startX } : {}),
    }
  })

  const lastDay = dayGeometry[dayGeometry.length - 1]!
  return {
    geometry: Object.freeze({
      sessionSlots,
      contentWidth,
      days: Object.freeze(dayGeometry),
      segments: Object.freeze(buildSegments(dayRanges, slots, layout.centers)),
      verticalGridLineXs: Object.freeze(
        dayGeometry.length > 1
          ? [dayGeometry[0]!.startX, ...dayGeometry.slice(1).map((day) => day.startX), lastDay.endX]
          : [],
      ),
    }),
    centers: layout.centers,
    kWidthPx: layout.kWidthPx,
  }
}
