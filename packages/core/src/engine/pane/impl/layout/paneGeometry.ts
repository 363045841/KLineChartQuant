/** Pane 像素分配纯函数：最小高度可满足时保留约束，不足时按最小高度等比压缩。 */
/** 预算不足时统一缩减最小高度；极小容器允许零高度，不产生越界矩形。 */
export function fitPaneMinimums(minimums: readonly number[], available: number): number[] {
  const sum = minimums.reduce((total, value) => total + value, 0)
  return sum <= available ? [...minimums] : minimums.map((value) => (value * available) / sum)
}

/** 按权重分配并锁定低于最小高度的 pane，最后按累计边界取整，保证总高度精确守恒。 */
export function computePaneHeights(
  ratios: readonly number[],
  minimums: readonly number[],
  available: number,
): number[] {
  const mins = fitPaneMinimums(minimums, available)
  const heights = ratios.map(() => 0)
  let pending = ratios.map((_, index) => index)
  let budget = available
  while (pending.length > 0) {
    const weight = pending.reduce((sum, index) => sum + ratios[index]!, 0)
    const constrained = pending.filter((index) => (budget * ratios[index]!) / weight < mins[index]!)
    if (constrained.length === 0) {
      for (const index of pending) heights[index] = (budget * ratios[index]!) / weight
      break
    }
    for (const index of constrained) {
      heights[index] = mins[index]!
      budget -= mins[index]!
    }
    const locked = new Set(constrained)
    pending = pending.filter((index) => !locked.has(index))
  }
  let offset = 0
  return heights.map((height) => {
    const top = Math.round(offset)
    offset += height
    return Math.round(offset) - top
  })
}
