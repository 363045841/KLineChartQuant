/** 五日分时帧级共享几何计算。 */
import type { TimeShareRange } from '../../data/provider/types'
import type { FiveDayTimeShareGeometry } from '../../foundation/plugin'
import {
  resolveMarketSessionSlots,
  resolveTimestampSessionSlot,
  type MarketSessionConfig,
} from '../../foundation/utils/timeShareAxisLabels'
import { computeTimeShareXLayout } from './timeShareMath'

export interface FiveDayTimeShareGeometryInput {
  range: TimeShareRange
  marketSession: MarketSessionConfig
  contentWidth: number
  dpr: number
}

export interface FiveDayTimeShareFrameGeometry {
  geometry: FiveDayTimeShareGeometry
  centers: number[]
  barWidth: number
  barVisible: boolean[]
  kWidthPx: number
}

/** 计算五日分时内容宽度，保证每个交易槽至少占一个物理像素。 */
export function computeFiveDayTimeShareContentWidth(
  viewWidth: number,
  dayCount: number,
  sessionSlots: number,
  dpr: number,
): number {
  if (viewWidth <= 0 || dayCount <= 0 || sessionSlots <= 0 || !(dpr > 0)) return 0
  return Math.max(viewWidth, (dayCount * sessionSlots) / dpr)
}

/** 根据交易日分组和 session 槽位生成唯一的五日分时横向几何。 */
export function computeFiveDayTimeShareGeometry(
  input: FiveDayTimeShareGeometryInput,
): FiveDayTimeShareFrameGeometry | null {
  const { range, marketSession, contentWidth, dpr } = input
  const sessionSlots = resolveMarketSessionSlots(marketSession)
  const dayCount = range.days.length
  const totalSlots = dayCount * sessionSlots
  if (dayCount === 0 || totalSlots <= 0 || contentWidth <= 0 || !(dpr > 0)) return null

  const slotIndices: number[] = []
  let dataOffset = 0
  for (let dayIndex = 0; dayIndex < dayCount; dayIndex++) {
    const day = range.days[dayIndex]!
    for (let pointIndex = 0; pointIndex < day.data.length; pointIndex++) {
      const point = day.data[pointIndex]!
      const intradaySlot =
        resolveTimestampSessionSlot(point.timestamp, marketSession) ??
        Math.min(pointIndex, sessionSlots - 1)
      slotIndices[dataOffset++] = dayIndex * sessionSlots + intradaySlot
    }
  }

  const layout = computeTimeShareXLayout({
    arrivedCount: slotIndices.length,
    sessionSlots: totalSlots,
    totalWidth: contentWidth,
    dpr,
    slotIndices,
  })
  if (!layout) return null

  const days = []
  dataOffset = 0
  for (let dayIndex = 0; dayIndex < dayCount; dayIndex++) {
    const day = range.days[dayIndex]!
    const startX = layout.offset + dayIndex * sessionSlots * layout.step
    const endX = layout.offset + (dayIndex + 1) * sessionSlots * layout.step
    days.push(
      Object.freeze({
        tradingDate: day.tradingDate,
        dataStartIndex: dataOffset,
        dataEndIndex: dataOffset + day.data.length,
        startX,
        endX,
        labelX: (startX + endX) / 2,
        separatorX: dayIndex > 0 ? startX : undefined,
      }),
    )
    dataOffset += day.data.length
  }

  return {
    geometry: Object.freeze({
      sessionSlots,
      contentWidth,
      days: Object.freeze(days),
    }),
    centers: layout.centers,
    barWidth: layout.barWidth,
    barVisible: layout.barVisible,
    kWidthPx: layout.kWidthPx,
  }
}
