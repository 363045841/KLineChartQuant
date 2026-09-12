// 比较视图基准索引：选取内容区内首根完全可见的 bar，供折线渲染与 y 轴范围共用。

/**
 * 计算比较视图公共基准点的数据索引。
 *
 * 可见区间左右各扩 1 根，range.start 对应的 bar 中心可能落在内容区左缘之外（屏幕外），
 * 直接以它为基准会导致所有曲线的公共起点不可见，因此从 range.start 起向后选取
 * 首个中心屏幕 x >= 0 的 bar。
 *
 * @param range 当前可见区间（clamped，start >= 0）
 * @param kLineCenters 可见区间内各 bar 的世界坐标中心 x（索引 i 对应 range.start + i）
 * @param scrollLeft 当前横向滚动量（逻辑像素）
 * @returns 基准数据索引；全部落在屏外或越界时回退到 range.start
 */
export function resolveComparisonBaseIndex(
  range: { start: number; end: number },
  kLineCenters: ReadonlyArray<number>,
  scrollLeft: number,
): number {
  const fallback = Math.max(0, range.start)
  for (let i = fallback; i < range.end; i++) {
    const center = kLineCenters[i - range.start]
    if (center === undefined) break
    if (center - scrollLeft >= 0) return i
  }
  return fallback
}
