/** 将逻辑索引按当前帧封存的中心点投影为屏幕 X 坐标。 */

export interface LogicalIndexScreenXInput {
  readonly index: number
  readonly visibleRange: { readonly start: number; readonly end: number }
  readonly centers: ReadonlyArray<number>
  readonly scrollLeft: number
  /** 仅有一个中心点时使用的逻辑槽位步长。 */
  readonly fallbackStep: number
}

/**
 * 将任意有效逻辑索引投影为当前视口的屏幕 X 坐标。
 *
 * 可见范围外的索引按当前帧第一个中心点及槽位步长线性外推，确保未来槽位、
 * 渲染、命中与拖拽共享同一坐标语义。
 */
export function logicalIndexToScreenX(input: LogicalIndexScreenXInput): number | null {
  const { index, visibleRange, centers, scrollLeft, fallbackStep } = input
  if (!Number.isInteger(index) || index < 0 || centers.length === 0) return null

  const center = centers[index - visibleRange.start]
  if (Number.isFinite(center)) return center - scrollLeft

  const step =
    centers.length >= 2
      ? index < visibleRange.start
        ? centers[1]! - centers[0]!
        : centers[centers.length - 1]! - centers[centers.length - 2]!
      : fallbackStep
  if (!Number.isFinite(step) || step === 0) return null
  const originIndex = index < visibleRange.start ? visibleRange.start : visibleRange.end - 1
  const originCenter = index < visibleRange.start ? centers[0]! : centers[centers.length - 1]!
  return originCenter + (index - originIndex) * step - scrollLeft
}
