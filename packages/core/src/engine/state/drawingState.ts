/** 绘图状态模块：工具、图元与选中图元集合的 SSOT。 */
import { batch, createSubState } from '../../foundation/reactivity/signal'
import type { DrawingObject, DrawingStyle } from '../../foundation/plugin/index'
import type { DrawingToolId } from '../drawing/toolConfig'
import { deepFreezeSnapshot } from './immutable'

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
  const existingIds = new Set(drawings.map((drawing) => drawing.id))
  return Object.freeze([...new Set(ids.filter((id) => existingIds.has(id)))])
}

/** 判断两个选中快照是否完全相同，避免无意义的响应式通知。 */
function hasSameIds(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

export function createDrawingState() {
  const { signals, readonly } = createSubState({
    drawingTool: 'cursor' as DrawingToolId,
    drawings: Object.freeze([]) as ReadonlyArray<DrawingObject>,
    selectedDrawingIds: Object.freeze([]) as ReadonlyArray<string>,
  })

  return {
    readonly,

    actions: {
      setDrawingTool(tool: DrawingToolId) {
        if (signals.drawingTool.peek() === tool) return
        signals.drawingTool.set(tool)
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

      /** 新增或替换指定 id 的已确认图元，并返回是否发生变更。 */
      upsertDrawing(drawing: DrawingObject): boolean {
        const current = signals.drawings.peek()
        const index = current.findIndex((item) => item.id === drawing.id)
        const next = [...current]
        if (index === -1) next.push(drawing)
        else next[index] = drawing
        signals.drawings.set(snapshotDrawings(next))
        return true
      },

      /** 以完整模型快照替换指定图元，并返回更新后的不可变快照。 */
      updateDrawing(id: string, drawing: DrawingObject): DrawingObject | null {
        const current = signals.drawings.peek()
        const index = current.findIndex((drawing) => drawing.id === id)
        if (index === -1) return null
        const next = [...current]
        next[index] = drawing
        const snapshot = snapshotDrawings(next)
        signals.drawings.set(snapshot)
        return snapshot[index]!
      },

      /** 原子更新一批已确认图元的公共属性。 */
      updateDrawings(
        ids: ReadonlyArray<string>,
        patch: {
          readonly style?: Partial<DrawingStyle>
          readonly visible?: boolean
          readonly locked?: boolean
          readonly zIndex?: number
        },
      ): ReadonlyArray<DrawingObject> {
        const idSet = new Set(ids)
        if (idSet.size === 0) return Object.freeze([])
        const current = signals.drawings.peek()
        const targets = current.filter((drawing) => idSet.has(drawing.id))
        if (targets.length !== idSet.size) return Object.freeze([])

        const next = current.map((drawing) => {
          if (!idSet.has(drawing.id)) return drawing
          return {
            ...drawing,
            ...(patch.style === undefined ? {} : { style: { ...drawing.style, ...patch.style } }),
            ...(patch.visible === undefined ? {} : { visible: patch.visible }),
            ...(patch.locked === undefined ? {} : { locked: patch.locked }),
            ...(patch.zIndex === undefined ? {} : { zIndex: patch.zIndex }),
          }
        })
        const snapshot = snapshotDrawings(next)
        signals.drawings.set(snapshot)
        const snapshotsById = new Map(snapshot.map((drawing) => [drawing.id, drawing]))
        return Object.freeze(targets.map((drawing) => snapshotsById.get(drawing.id)!))
      },

      /** 按 id 移除已确认图元，并同步剔除失效的选中状态。 */
      removeDrawing(id: string): boolean {
        const current = signals.drawings.peek()
        const next = current.filter((drawing) => drawing.id !== id)
        if (next.length === current.length) return false
        const selected = snapshotSelectedDrawingIds(signals.selectedDrawingIds.peek(), next)
        batch(() => {
          signals.drawings.set(snapshotDrawings(next))
          if (!hasSameIds(signals.selectedDrawingIds.peek(), selected)) {
            signals.selectedDrawingIds.set(selected)
          }
        })
        return true
      },

      /** 原子移除一批已确认图元，并同步清理选中集合。 */
      removeDrawings(ids: ReadonlyArray<string>): boolean {
        const idSet = new Set(ids)
        if (idSet.size === 0) return false
        const current = signals.drawings.peek()
        const next = current.filter((drawing) => !idSet.has(drawing.id))
        if (next.length !== current.length - idSet.size) return false
        const selected = snapshotSelectedDrawingIds(signals.selectedDrawingIds.peek(), next)
        batch(() => {
          signals.drawings.set(snapshotDrawings(next))
          if (!hasSameIds(signals.selectedDrawingIds.peek(), selected)) {
            signals.selectedDrawingIds.set(selected)
          }
        })
        return true
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
        signals.drawingTool.set('cursor')
        signals.drawings.set(Object.freeze([]))
        signals.selectedDrawingIds.set(Object.freeze([]))
      })
    },
  }
}

export type DrawingStateModule = ReturnType<typeof createDrawingState>
