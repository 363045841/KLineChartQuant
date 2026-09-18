// 可见 bar 索引工具：在可见区间内定位真正进入内容区的首尾 bar。

/** 可见 bar 的数据索引范围（闭区间）。 */
export interface VisibleBarRange {
  /** 首个中心进入内容区的 bar 数据索引 */
  first: number
  /** 最后一个中心进入内容区的 bar 数据索引 */
  last: number
}

/**
 * 查找可见区间内中心落在内容区内的 bar 数据索引范围。
 *
 * 可见区间左右各扩 1 根，range.start / range.end 对应的 bar 中心可能落在内容区外，
 * 因此按屏幕 x 收缩到真正可见的首尾：first 取首个 center - scrollLeft >= 0 的 bar，
 * last 取最后一个 center - scrollLeft <= paneWidth 的 bar。
 *
 * @param range 当前可见区间（clamped，start >= 0）
 * @param kLineCenters 可见区间内各 bar 的世界坐标中心 x（索引 i 对应 range.start + i）
 * @param scrollLeft 当前横向滚动量（逻辑像素）
 * @param paneWidth 内容区逻辑宽度（逻辑像素）
 * @returns 可见 bar 的闭区间索引；无可用 bar 时 last < first
 */
export function findVisibleBarRange(
  range: { start: number; end: number },
  kLineCenters: ReadonlyArray<number>,
  scrollLeft: number,
  paneWidth: number,
): VisibleBarRange {
  const firstFallback = Math.max(0, range.start)
  const empty: VisibleBarRange = { first: firstFallback, last: firstFallback - 1 }
  const lastCandidate = Math.min(range.end - 1, range.start + kLineCenters.length - 1)

  let first = -1
  for (let i = firstFallback; i <= lastCandidate; i++) {
    const center = kLineCenters[i - range.start]
    if (center === undefined) break
    if (center - scrollLeft >= 0) {
      first = i
      break
    }
  }
  if (first < 0) return empty

  let last = -1
  for (let i = lastCandidate; i >= first; i--) {
    const center = kLineCenters[i - range.start]
    if (center === undefined) continue
    if (center - scrollLeft <= paneWidth) {
      last = i
      break
    }
  }
  if (last < 0) return empty

  return { first, last }
}
