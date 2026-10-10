/**
 * 像素对齐工具函数 - 逻辑像素空间（配合 ctx.scale(dpr) 使用）
 */

/**
 * 将逻辑坐标对齐到物理像素边界（用于矩形填充）
 * @param value - 逻辑坐标值
 * @param dpr - 设备像素比
 * @returns 对齐后的逻辑坐标
 */
export function roundToPhysicalPixel(value: number, dpr: number, theme?: 'light' | 'dark'): number {
  return Math.round(value * dpr) / dpr
}

/** 将世界 X 坐标按当前滚动量投影并对齐到屏幕物理像素。 */
export function worldXToScreenX(worldX: number, scrollLeft: number, dpr: number): number {
  return Math.round((worldX - scrollLeft) * dpr) / dpr
}

/** 将世界坐标中的矩形 X 边界投影到屏幕物理像素，保持至少一个物理像素宽度。 */
export function projectWorldRectToScreen(
  worldX: number,
  width: number,
  scrollLeft: number,
  dpr: number,
): { x: number; width: number } {
  const x = worldXToScreenX(worldX, scrollLeft, dpr)
  const right = worldXToScreenX(worldX + width, scrollLeft, dpr)
  return { x, width: Math.max(1 / dpr, right - x) }
}

/**
 * 将逻辑坐标对齐到物理像素中心（用于 1px 线条）
 * @param value - 逻辑坐标值
 * @param dpr - 设备像素比
 * @returns 对齐后的逻辑坐标
 */
export function alignToPhysicalPixelCenter(
  value: number,
  dpr: number,
  theme?: 'light' | 'dark',
): number {
  return (Math.floor(value * dpr) + 0.5) / dpr
}

/**
 * 创建用于绘制垂直线的矩形（1 物理像素宽）
 * @param centerX - 垂直线中心 X 坐标
 * @param y1 - 垂直线起始点 Y 坐标
 * @param y2 - 垂直线结束点 Y 坐标
 * @param dpr - 设备像素比
 * @returns 对齐到物理像素的矩形信息，如果 y1 和 y2 相等则返回 null
 */
export function createVerticalLineRect(
  centerX: number,
  y1: number,
  y2: number,
  dpr: number,
  theme?: 'light' | 'dark',
): { x: number; y: number; width: number; height: number } | null {
  if (y1 === y2) return null

  const top = Math.min(y1, y2)
  const bottom = Math.max(y1, y2)

  // 转换到物理像素空间取整，再转回逻辑像素
  const physX = Math.round(centerX * dpr)
  const physTop = Math.round(top * dpr)
  const physBottom = Math.round(bottom * dpr)

  return {
    x: physX / dpr,
    y: physTop / dpr,
    width: 1 / dpr,
    height: Math.max(1, physBottom - physTop) / dpr,
  }
}

/**
 * 创建用于绘制水平线的矩形（1 物理像素高）
 * @param x1 - 水平线起始点的 X 坐标
 * @param x2 - 水平线结束点的 X 坐标
 * @param centerY - 水平线中心 Y 坐标
 * @param dpr - 设备像素比
 * @returns 对齐到物理像素的矩形信息，如果 x1 和 x2 相等则返回 null
 */
export function createHorizontalLineRect(
  x1: number,
  x2: number,
  centerY: number,
  dpr: number,
  theme?: 'light' | 'dark',
): { x: number; y: number; width: number; height: number } | null {
  if (x1 === x2) return null

  const left = Math.min(x1, x2)
  const right = Math.max(x1, x2)

  const physLeft = Math.round(left * dpr)
  const physRight = Math.round(right * dpr)
  const physY = Math.round(centerY * dpr)

  return {
    x: physLeft / dpr,
    y: physY / dpr,
    width: Math.max(1, physRight - physLeft) / dpr,
    height: 1 / dpr,
  }
}
