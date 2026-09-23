/** 绘图选中集合的纯领域操作，供各类交互入口复用。 */

/** 返回空的绘图选中集合。 */
export function clearDrawingSelection(): string[] {
  return []
}

/**
 * 按 Ctrl 多选语义切换目标图元。
 * 保留未命中图元的选择顺序，并按 targets 的顺序追加新增图元。
 */
export function toggleDrawingSelection(
  selectedIds: ReadonlyArray<string>,
  targetIds: ReadonlyArray<string>,
): string[] {
  const uniqueTargetIds = new Set(targetIds)
  const selectedIdSet = new Set(selectedIds)
  return [
    ...selectedIds.filter((id) => !uniqueTargetIds.has(id)),
    ...targetIds.filter((id, index) => !selectedIdSet.has(id) && targetIds.indexOf(id) === index),
  ]
}
