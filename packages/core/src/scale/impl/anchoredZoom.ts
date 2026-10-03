/** TimeScale 的指针缩放适配器，与图表交互共用无界槽位变换。 */
import { zoomSlotGrid } from '../../foundation/geometry/slotGrid.js'
import type { AnchoredZoomOptions, AnchoredZoomResult } from '../types.js'

const DEFAULT_MIN_BAR_WIDTH = 0.5
const DEFAULT_MAX_BAR_WIDTH = 200

/**
 * 按目标槽宽求解 firstVisibleIndex；尺寸上限不改变指针槽位。
 * @internal 独立 TimeScale 的内部计算入口。
 */
export function computeAnchoredZoom(options: AnchoredZoomOptions): AnchoredZoomResult {
  const { barWidth, firstVisibleIndex, zoomFactor, leftPadding, mouseX } = options
  if (zoomFactor === 1 || !Number.isFinite(barWidth) || barWidth <= 0) {
    return { firstVisibleIndex, barWidth }
  }
  const width = Math.min(
    options.maxBarWidth ?? DEFAULT_MAX_BAR_WIDTH,
    Math.max(options.minBarWidth ?? DEFAULT_MIN_BAR_WIDTH, barWidth * zoomFactor),
  )
  const scroll = zoomSlotGrid(
    { origin: leftPadding, step: barWidth },
    { origin: leftPadding, step: width },
    firstVisibleIndex * barWidth,
    mouseX,
  )
  return { firstVisibleIndex: scroll / width, barWidth: width }
}
