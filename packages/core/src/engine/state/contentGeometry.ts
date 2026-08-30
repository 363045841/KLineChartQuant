/** 按数据视图与缩放派生内容几何尺寸（宽度/缓冲）的纯函数。 */
import { SCROLL_TRAILING_SLOTS } from '../data/scrollCompensator'
import { getPhysicalKLineConfig } from '../utils/klineConfig'
import { FIVE_DAY_TIME_SHARE_PERIOD, isTimeSharePeriod } from '../../controllers/types'
import { computeFiveDayTimeShareContentWidth } from '../modes/fiveDayTimeShareGeometry'

export type ContentGeometryInput = {
  viewWidth: number
  plotWidth: number
  dataLength: number
  period: string
  dpr: number
  kWidth: number
  kGap: number
  timeShareDayCount?: number
  sessionSlots?: number
}

export function computeLeftLoadBufferWidth(input: ContentGeometryInput): number {
  if (input.dataLength === 0 || isTimeSharePeriod(input.period)) return 0
  return Math.round(input.viewWidth)
}

export function computeContentWidth(input: ContentGeometryInput): number {
  if (input.dataLength === 0) return 0
  const left = computeLeftLoadBufferWidth(input)
  if (input.period === FIVE_DAY_TIME_SHARE_PERIOD) {
    return computeFiveDayTimeShareContentWidth(
      input.viewWidth,
      input.timeShareDayCount ?? 0,
      input.sessionSlots ?? 0,
      input.dpr,
    )
  }
  if (isTimeSharePeriod(input.period)) {
    return left + Math.max(input.viewWidth, 1)
  }
  const { startXPx, unitPx } = getPhysicalKLineConfig(input.kWidth, input.kGap, input.dpr)
  const dataPlotWidth = (startXPx + (input.dataLength + SCROLL_TRAILING_SLOTS) * unitPx) / input.dpr
  return left + Math.max(dataPlotWidth, input.viewWidth)
}

export function computeMaxScrollLeft(contentWidth: number, viewWidth: number): number {
  return Math.max(0, contentWidth - viewWidth)
}
