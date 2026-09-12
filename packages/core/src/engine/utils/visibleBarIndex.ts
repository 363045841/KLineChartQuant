// 可见 bar 索引工具：在可见区间内定位首根完全落在内容区内的 bar。

/**
 * 查找可见区间内首根中心落在内容区内的 bar 的数据索引。
 *
 * 可见区间左右各扩 1 根，range.start 对应的 bar 中心可能落在内容区左缘之外（屏幕外），
 * 因此从 range.start 起向后选取首个中心屏幕 x >= 0 的 bar。
 *
 * @param range 当前可见区间（clamped，start >= 0）
 * @param kLineCenters 可见区间内各 bar 的世界坐标中心 x（索引 i 对应 range.start + i）
 * @param scrollLeft 当前横向滚动量（逻辑像素）
 * @returns 首个可见 bar 的数据索引；全部落在屏外或越界时回退到 range.start
 */
export function findFirstVisibleBarIndex(
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
