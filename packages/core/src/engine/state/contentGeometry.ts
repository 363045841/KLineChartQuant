import { SCROLL_TRAILING_SLOTS } from '../data/scrollCompensator'
import { getPhysicalKLineConfig } from '../utils/klineConfig'

export type ContentGeometryInput = {
  viewWidth: number
  plotWidth: number
  dataLength: number
  period: string
  dpr: number
  kWidth: number
  kGap: number
  /** 分时模式下的总槽位数；未传入时保持旧单日布局。 */
  sessionSlots?: number
}

export function computeLeftLoadBufferWidth(input: ContentGeometryInput): number {
  if (input.dataLength === 0 || input.period === 'timeshare') return 0
  return Math.round(input.viewWidth)
}

export function computeContentWidth(input: ContentGeometryInput): number {
  if (input.dataLength === 0) return 0
  const left = computeLeftLoadBufferWidth(input)
  if (input.period === 'timeshare') {
    const slotWidth = Math.max(0, input.sessionSlots ?? 0) / Math.max(input.dpr, 1)
    return left + Math.max(input.viewWidth, slotWidth, 1)
  }
  const { startXPx, unitPx } = getPhysicalKLineConfig(input.kWidth, input.kGap, input.dpr)
  const dataPlotWidth = (startXPx + (input.dataLength + SCROLL_TRAILING_SLOTS) * unitPx) / input.dpr
  return left + Math.max(dataPlotWidth, input.viewWidth)
}

export function computeMaxScrollLeft(contentWidth: number, viewWidth: number): number {
  return Math.max(0, contentWidth - viewWidth)
}
