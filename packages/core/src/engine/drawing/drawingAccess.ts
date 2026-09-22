/** 图元可变性判定：锁定只冻结几何拖动与删除，其余字段（样式/参数/标签/显隐/zIndex/解锁）照常可写。 */

import type { DrawingObject, PersistedDrawingAnchor } from '../../foundation/plugin/index.js'

/** 判断图元是否已锁定；锁定图元禁止拖动与删除。 */
export function isDrawingLocked(drawing: Pick<DrawingObject, 'locked'>): boolean {
  return drawing.locked === true
}

/**
 * 判断两份锚点是否逐点相同；用于识别全量快照是否改动了锁定图元的几何。
 * 新增锚点字段时需同步扩展字段比较，否则锁定图元可能被新字段绕过拖动门控。
 * @param current 当前锚点
 * @param next 待写入锚点
 * @returns 全部锚点的对比字段都一致时为 true
 */
export function areAnchorsIdentical(
  current: ReadonlyArray<PersistedDrawingAnchor>,
  next: ReadonlyArray<PersistedDrawingAnchor>,
): boolean {
  if (current.length !== next.length) return false
  return current.every((anchor, index) => isSameAnchor(anchor, next[index]!))
}

/** 比较两个锚点的全部持久化字段。 */
function isSameAnchor(a: PersistedDrawingAnchor, b: PersistedDrawingAnchor): boolean {
  return (
    a.id === b.id &&
    a.type === b.type &&
    a.time === b.time &&
    a.futureOffset === b.futureOffset &&
    a.price === b.price
  )
}
