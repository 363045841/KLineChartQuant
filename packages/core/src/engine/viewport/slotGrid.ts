/** 无界槽位网格：中心坐标、指针索引与缩放共用同一坐标契约。 */

import type { SlotGrid } from '../../foundation/geometry/slotGrid.js'
import { resolveSessionSlotPhysicalGrid } from '../../foundation/utils/timeShareAxisLabels.js'
import { getPhysicalKLineConfig } from './klineConfig.js'

export {
  type SlotGrid,
  slotIndexAt,
  slotWorldX,
  zoomSlotGrid,
} from '../../foundation/geometry/slotGrid.js'

/** 从分时实际内容宽度生成与绘制相同的交易槽位网格。 */
export function createTimeShareSlotGrid(width: number, slots: number, dpr: number): SlotGrid {
  const grid = resolveSessionSlotPhysicalGrid(width, slots, dpr)
  const step = grid ? grid.unitPx / dpr : width / Math.max(1, slots)
  return {
    origin: grid ? (grid.offsetPx + Math.floor(grid.unitPx / 2)) / dpr : step / 2,
    step,
  }
}

/** 从实际绘制的物理几何生成 K 线槽位网格。 */
export function createKLineSlotGrid(kWidth: number, kGap: number, dpr: number): SlotGrid {
  const geometry = getPhysicalKLineConfig(kWidth, kGap, dpr)
  return {
    origin: (geometry.startXPx + (geometry.kWidthPx - 1) / 2) / dpr,
    step: geometry.unitPx / dpr,
  }
}
