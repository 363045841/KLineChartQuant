/** 绘图状态模块：工具、图元与选中图元集合的 SSOT。 */

import { isDrawingInteractive } from '@363045841yyt/klinechart-plot-contracts'
import { batch, createSubState } from '../../foundation/reactivity/signal.js'
import { CURSOR_DRAWING_TOOL_ID, type DrawingObject, type DrawingToolId } from '../drawing/index.js'
import { deepFreezeSnapshot } from './immutable.js'

function snapshotDrawings(drawings: ReadonlyArray<DrawingObject>): ReadonlyArray<DrawingObject> {
  return Object.freeze(
    drawings.map(
      (drawing) =>
        deepFreezeSnapshot({
          ...drawing,
          anchors: drawing.anchors.map((anchor) => ({ ...anchor })),
        }) as DrawingObject,
    ),
  )
}

/** 仅保留已存在图元的唯一选中 id，并固定快照以供外部安全读取。 */
function snapshotSelectedDrawingIds(
  ids: ReadonlyArray<string>,
  drawings: ReadonlyArray<DrawingObject>,
): ReadonlyArray<string> {
  const existingIds = new Set(drawings.filter((drawing) => drawing.visible && isDrawingInteractive(drawing)).map((drawing) => drawing.id))
  return Object.freeze([...new Set(ids.filter((id) => existingIds.has(id)))])
}

/** 判断两个选中快照是否完全相同，避免无意义的响应式通知。 */
function hasSameIds(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

export function createDrawingState() {
  const { signals, readonly } = createSubState({
    // 常量保持字面量类型，此处显式标注让信号类型仍是完整的 DrawingToolId。
    drawingTool: CURSOR_DRAWING_TOOL_ID as DrawingToolId,
    drawings: Object.freeze([]) as ReadonlyArray<DrawingObject>,
    selectedDrawingIds: Object.freeze([]) as ReadonlyArray<string>,
    globalDrawingLock: false,
  })

  return {
    readonly,

    actions: {
      setDrawingTool(tool: DrawingToolId) {
        if (signals.drawingTool.peek() === tool) return
        signals.drawingTool.set(tool)
      },

      /** 设置全局绘图锁定；全局锁只冻结图元移动，不改写各图元自身 locked。 */
      setGlobalDrawingLock(locked: boolean) {
        if (signals.globalDrawingLock.peek() === locked) return
        signals.globalDrawingLock.set(locked)
      },

      setDrawings(drawings: ReadonlyArray<DrawingObject>): ReadonlyArray<DrawingObject> {
        const next = snapshotDrawings(drawings)
        const selected = snapshotSelectedDrawingIds(signals.selectedDrawingIds.peek(), next)
        batch(() => {
          signals.drawings.set(next)
          if (!hasSameIds(signals.selectedDrawingIds.peek(), selected)) {
            signals.selectedDrawingIds.set(selected)
          }
        })
        return next
      },

      /** 以一个原子文档快照提交图元和选择，用户操作与历史回放共用。 */
      commitDocument(
        drawings: ReadonlyArray<DrawingObject>,
        selectedIds: ReadonlyArray<string>,
      ): void {
        const next = snapshotDrawings(drawings)
        const selected = snapshotSelectedDrawingIds(selectedIds, next)
        batch(() => {
          signals.drawings.set(next)
          signals.selectedDrawingIds.set(selected)
        })
      },

      /** 设置当前选中图元集合；不存在的 id 会被忽略。 */
      setSelectedDrawingIds(ids: ReadonlyArray<string>) {
        const next = snapshotSelectedDrawingIds(ids, signals.drawings.peek())
        if (hasSameIds(signals.selectedDrawingIds.peek(), next)) return
        signals.selectedDrawingIds.set(next)
      },

      clearDrawings() {
        batch(() => {
          signals.drawings.set(Object.freeze([]))
          signals.selectedDrawingIds.set(Object.freeze([]))
        })
      },
    },

    dispose() {
      batch(() => {
        signals.drawingTool.set(CURSOR_DRAWING_TOOL_ID)
        signals.drawings.set(Object.freeze([]))
        signals.selectedDrawingIds.set(Object.freeze([]))
        signals.globalDrawingLock.set(false)
      })
    },
  }
}

export type DrawingStateModule = ReturnType<typeof createDrawingState>
