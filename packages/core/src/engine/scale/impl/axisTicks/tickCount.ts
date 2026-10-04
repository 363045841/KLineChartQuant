/**
 * 根据面板高度计算网格线/价格标签数量
 * 刻度间距固定约 60px
 * @param height 面板高度（逻辑像素）
 * @param isMain 是否为主图面板（暂未使用，保留参数兼容）
 * @returns tick 数量
 */
export function calculateTickCount(height: number, isMain?: boolean): number {
  const tickSpacing = 60 // 固定间距
  return Math.max(3, Math.round(height / tickSpacing) + 1)
}
