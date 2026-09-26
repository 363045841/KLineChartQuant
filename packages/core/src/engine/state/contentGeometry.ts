/** 按数据视图与缩放派生内容几何尺寸（宽度/缓冲）的纯函数。 */

import { FIVE_DAY_TIME_SHARE_PERIOD, isTimeSharePeriod } from '../../controllers/types.js'
import { SCROLL_TRAILING_SLOTS } from '../data/scrollCompensator.js'
import { computeFiveDayTimeShareContentWidth } from '../modes/index.js'
import { getPhysicalKLineConfig } from '../utils/klineConfig.js'
import { futureBarCount } from '../viewport/viewport.js'

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
  timeShareSlotWidth?: number
  /** 未来区屏数；调用方未传则不加未来区内容，默认值解析在 viewportState 单点完成 */
  futureScreens?: number
}

export function computeLeftLoadBufferWidth(input: ContentGeometryInput): number {
  if (input.dataLength === 0 || isTimeSharePeriod(input.period)) return 0
  return Math.round(input.viewWidth)
}

export function computeContentWidth(input: ContentGeometryInput): number {
  if (input.dataLength === 0) return 0
  const left = computeLeftLoadBufferWidth(input)
  if (isTimeSharePeriod(input.period)) {
    const dayCount =
      input.period === FIVE_DAY_TIME_SHARE_PERIOD ? (input.timeShareDayCount ?? 0) : 1
    const minimumWidth = computeFiveDayTimeShareContentWidth(
      input.viewWidth,
      dayCount,
      input.sessionSlots ?? 0,
      input.dpr,
    )
    const dpr = input.dpr > 0 ? input.dpr : 1
    const slotWidth = Math.max(1 / dpr, input.timeShareSlotWidth ?? 0)
    return Math.max(minimumWidth, dayCount * (input.sessionSlots ?? 0) * slotWidth)
  }
  const { startXPx, unitPx } = getPhysicalKLineConfig(input.kWidth, input.kGap, input.dpr)
  // 未来区槽位与 Task 1 同量纲；未传 futureScreens 不加未来区内容，负值由 futureBarCount 钳 0
  const futureBars = futureBarCount(input.plotWidth, input.dpr, unitPx, input.futureScreens ?? 0)
  const trailingSlots = Math.max(SCROLL_TRAILING_SLOTS, futureBars)
  const dataPlotWidth = (startXPx + (input.dataLength + trailingSlots) * unitPx) / input.dpr
  return left + Math.max(dataPlotWidth, input.viewWidth)
}

export function computeMaxScrollLeft(contentWidth: number, viewWidth: number): number {
  return Math.max(0, contentWidth - viewWidth)
}
