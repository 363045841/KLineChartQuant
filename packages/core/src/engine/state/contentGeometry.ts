/** 按数据视图与缩放派生内容几何尺寸（宽度/缓冲）的纯函数。 */

import { FIVE_DAY_TIME_SHARE_PERIOD, isTimeSharePeriod } from '../../controllers/types.js'
import { computeFiveDayTimeShareContentWidth } from '../modes/index.js'
import { getPhysicalKLineConfig } from '../utils/klineConfig.js'

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
}

/** 内容边界与未来槽位共用的几何快照，所有宽度均为逻辑像素。 */
export type ContentGeometry = {
  contentWidth: number
  maxScrollLeft: number
  futureWidth: number
  futureBarCount: number
}

/** 计算左侧加载缓冲；K 线保留当前视图宽度，分时与空数据不留缓冲。 */
export function computeLeftLoadBufferWidth(input: ContentGeometryInput): number {
  if (input.dataLength === 0 || isTimeSharePeriod(input.period)) return 0
  return Math.round(input.viewWidth)
}

/** 从当前视图和物理槽位网格派生完整内容几何，右移极限保留最后两个数据槽位。 */
export function computeContentGeometry(input: ContentGeometryInput): ContentGeometry {
  if (input.dataLength === 0) {
    return { contentWidth: 0, maxScrollLeft: 0, futureWidth: 0, futureBarCount: 0 }
  }
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
    const contentWidth = Math.max(minimumWidth, dayCount * (input.sessionSlots ?? 0) * slotWidth)
    return {
      contentWidth,
      maxScrollLeft: computeMaxScrollLeft(contentWidth, input.viewWidth),
      futureWidth: 0,
      futureBarCount: 0,
    }
  }
  const { unitPx } = getPhysicalKLineConfig(input.kWidth, input.kGap, input.dpr)
  const retainedBars = Math.min(2, input.dataLength)
  // 按槽位左缘定位，保留首个槽位的间隙；不使用可见范围的额外扩窗判断数据是否在屏内。
  const maxScrollLeft = left + ((input.dataLength - retainedBars) * unitPx) / input.dpr
  const futureWidthPx = Math.max(0, input.plotWidth * input.dpr - retainedBars * unitPx)
  return {
    contentWidth: maxScrollLeft + input.viewWidth,
    maxScrollLeft,
    futureWidth: futureWidthPx / input.dpr,
    // 最右侧不足一槽的区域仍属于未来槽位，内容宽度保持实际屏宽，不向上扩宽。
    futureBarCount: Math.ceil(futureWidthPx / unitPx),
  }
}

/** 返回统一几何快照中的内容宽度，供模式布局调用。 */
export function computeContentWidth(input: ContentGeometryInput): number {
  return computeContentGeometry(input).contentWidth
}

/** 根据内容宽度与容器宽度计算原生滚动边界。 */
export function computeMaxScrollLeft(contentWidth: number, viewWidth: number): number {
  return Math.max(0, contentWidth - viewWidth)
}
