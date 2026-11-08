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

/** K 线横轴网格与蜡烛可用实体宽度；Columns 只消费横轴网格。 */
export interface KLineSlotGeometry {
  grid: SlotGrid
  kWidthPx: number
}

/** 从实际绘制的物理几何生成 K 线槽位网格与柱宽。 */
export function createKLineSlotGeometry(
  kWidth: number,
  kGap: number,
  dpr: number,
): KLineSlotGeometry {
  const geometry = getPhysicalKLineConfig(kWidth, kGap, dpr)
  return {
    grid: {
      origin: (geometry.startXPx + (geometry.kWidthPx - 1) / 2) / dpr,
      step: geometry.unitPx / dpr,
    },
    kWidthPx: geometry.kWidthPx,
  }
}

/** 只取槽位网格；需要柱宽时用 createKLineSlotGeometry，避免重复派生。 */
export function createKLineSlotGrid(kWidth: number, kGap: number, dpr: number): SlotGrid {
  return createKLineSlotGeometry(kWidth, kGap, dpr).grid
}
