/** 无界槽位坐标契约：中心、最近索引与指针缩放使用同一变换。 */
export interface SlotGrid {
  /** 第 0 个槽位中心的逻辑像素位置。 */
  origin: number
  /** 相邻槽位中心的逻辑像素距离。 */
  step: number
}

/** 求解指针最近的整数槽位，两侧空白与数据区域使用相同规则。 */
export function slotIndexAt(grid: SlotGrid, worldX: number): number {
  return Math.floor((worldX - grid.origin) / grid.step + 0.5)
}

/** 将整数或连续槽位坐标映射到世界位置。 */
export function slotWorldX(grid: SlotGrid, index: number): number {
  return grid.origin + index * grid.step
}

/** 保持指针的连续槽位坐标，返回目标网格下的世界滚动量。 */
export function zoomSlotGrid(
  before: SlotGrid,
  after: SlotGrid,
  scrollLeft: number,
  pointerX: number,
): number {
  const coordinate = (scrollLeft + pointerX - before.origin) / before.step
  return slotWorldX(after, coordinate) - pointerX
}
