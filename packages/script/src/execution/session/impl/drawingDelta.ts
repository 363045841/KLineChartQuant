/** 绘图增量合并：reset 整体替换，否则保留未变化的同一对象引用。 */
import type { DrawingObject } from '@363045841yyt/klinechart-plot-contracts'
import type { DrawingDelta } from '../types.js'

/**
 * 把一次运行的绘图增量合并到上一轮结果。
 * @param current 上一轮完整绘图
 * @param delta 本次新增/修改/删除
 * @returns 合并后的完整绘图；未变化的条目保持原引用
 */
export function applyDrawingDelta(
  current: readonly DrawingObject[],
  delta: DrawingDelta,
): readonly DrawingObject[] {
  if (delta.reset) return delta.upsert.slice()
  const removed = new Set(delta.remove)
  const byId = new Map(
    current.filter((drawing) => !removed.has(drawing.id)).map((drawing) => [drawing.id, drawing]),
  )
  for (const drawing of delta.upsert) byId.set(drawing.id, drawing)
  return [...byId.values()]
}
