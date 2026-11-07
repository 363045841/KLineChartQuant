/** 绘图增量合并：reset 整体替换，否则保留未变化的同一对象引用。 */
import type { DrawingObject } from '@363045841yyt/klinechart-plot-contracts'
import type { DrawingPatch } from '../types.js'

/**
 * 把一次运行的绘图增量合并到上一轮结果。
 * @param current 上一轮完整绘图
 * @param patch 本次新增/修改/删除
 * @returns 合并后的完整绘图；未变化的条目保持原引用
 */
export function applyDrawingPatch(
  current: readonly DrawingObject[],
  patch: DrawingPatch,
): readonly DrawingObject[] {
  if (patch.reset) return patch.upsert.slice()
  const removed = new Set(patch.remove)
  const byId = new Map(
    current.filter((drawing) => !removed.has(drawing.id)).map((drawing) => [drawing.id, drawing]),
  )
  for (const drawing of patch.upsert) byId.set(drawing.id, drawing)
  return [...byId.values()]
}
