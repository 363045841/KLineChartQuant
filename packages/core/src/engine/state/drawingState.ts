/** 绘图状态模块：工具、图元与选中 id 的 SSOT。 */
import { batch, createSubState } from '../../foundation/reactivity/signal'
import type { DrawingObject, DrawingStyle } from '../../foundation/plugin/index'
import type { DrawingToolId } from '../drawing/toolConfig'
import { deepFreezeSnapshot } from './immutable'

function snapshotDrawings(drawings: ReadonlyArray<DrawingObject>): ReadonlyArray<DrawingObject> {
  return Object.freeze(drawings.map((d) => deepFreezeSnapshot({ ...d }) as DrawingObject))
}

export function createDrawingState() {
  const { signals, readonly } = createSubState({
    drawingTool: 'cursor' as DrawingToolId,
    drawings: Object.freeze([]) as ReadonlyArray<DrawingObject>,
    selectedDrawingId: null as string | null,
  })

  return {
    readonly,

    actions: {
      setDrawingTool(tool: DrawingToolId) {
        if (signals.drawingTool.peek() === tool) return
        signals.drawingTool.set(tool)
      },

      setDrawings(drawings: ReadonlyArray<DrawingObject>) {
        const next = snapshotDrawings(drawings)
        const selected = signals.selectedDrawingId.peek()
        batch(() => {
          signals.drawings.set(next)
          if (selected && !next.some((d) => d.id === selected)) {
            signals.selectedDrawingId.set(null)
          }
        })
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

      /** 按 id 更新图元的领域字段，并返回更新后的不可变快照。 */
      updateDrawing(
        id: string,
        patch: {
          readonly anchors?: DrawingObject['anchors']
          readonly style?: Partial<DrawingStyle>
          readonly visible?: boolean
          readonly locked?: boolean
          readonly zIndex?: number
          readonly params?: DrawingObject['params']
        },
      ): DrawingObject | null {
        const current = signals.drawings.peek()
        const index = current.findIndex((drawing) => drawing.id === id)
        if (index === -1) return null
        const drawing = current[index]!
        const nextDrawing: DrawingObject = {
          ...drawing,
          ...(patch.anchors === undefined ? {} : { anchors: patch.anchors }),
          ...(patch.style === undefined ? {} : { style: { ...drawing.style, ...patch.style } }),
          ...(patch.visible === undefined ? {} : { visible: patch.visible }),
          ...(patch.locked === undefined ? {} : { locked: patch.locked }),
          ...(patch.zIndex === undefined ? {} : { zIndex: patch.zIndex }),
          ...(patch.params === undefined ? {} : { params: patch.params }),
        }
        const next = [...current]
        next[index] = nextDrawing
        const snapshot = snapshotDrawings(next)
        signals.drawings.set(snapshot)
        return snapshot[index]!
      },

      /** 按 id 移除已确认图元，并同步清除已失效的选中状态。 */
      removeDrawing(id: string): boolean {
        const current = signals.drawings.peek()
        const next = current.filter((drawing) => drawing.id !== id)
        if (next.length === current.length) return false
        batch(() => {
          signals.drawings.set(snapshotDrawings(next))
          if (signals.selectedDrawingId.peek() === id) {
            signals.selectedDrawingId.set(null)
          }
        })
        return true
      },

      /**
       * 设置选中图元 id。允许任意 id（含尚未存在），与旧 DrawingStore 行为一致。
       * setDrawings 时若选中 id 不在列表则清 null。
       */
      setSelectedDrawingId(id: string | null) {
        if (signals.selectedDrawingId.peek() === id) return
        signals.selectedDrawingId.set(id)
      },

      clearDrawings() {
        batch(() => {
          signals.drawings.set(Object.freeze([]))
          signals.selectedDrawingId.set(null)
        })
      },
    },

    dispose() {
      batch(() => {
        signals.drawingTool.set('cursor')
        signals.drawings.set(Object.freeze([]))
        signals.selectedDrawingId.set(null)
      })
    },
  }
}

export type DrawingStateModule = ReturnType<typeof createDrawingState>
