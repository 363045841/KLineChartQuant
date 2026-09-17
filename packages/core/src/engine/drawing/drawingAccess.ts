/** 图元可变性判定：锁定即冻结拖动与编辑，但保留选中与解锁能力。 */

import type { DrawingObject } from '../../foundation/plugin/index.js'

/** 判断图元是否已锁定；锁定图元只接受 locked 字段写入。 */
export function isDrawingLocked(drawing: Pick<DrawingObject, 'locked'>): boolean {
  return drawing.locked === true
}
