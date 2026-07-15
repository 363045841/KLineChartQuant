import { batch, createSubState } from '../../foundation/reactivity/signal'
import type { DrawingObject } from '../../foundation/plugin/index'
import type { DrawingToolType } from '../chartTypes'
import { deepFreezeSnapshot } from './immutable'

function snapshotDrawings(drawings: ReadonlyArray<DrawingObject>): ReadonlyArray<DrawingObject> {
  return Object.freeze(drawings.map((d) => deepFreezeSnapshot({ ...d }) as DrawingObject))
}

export function createDrawingState() {
  const { signals, readonly } = createSubState({
    drawingTool: null as DrawingToolType | null,
    drawings: Object.freeze([]) as ReadonlyArray<DrawingObject>,
    selectedDrawingId: null as string | null,
  })

  return {
    readonly,

    actions: {
      setDrawingTool(tool: DrawingToolType | null) {
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
        signals.drawingTool.set(null)
        signals.drawings.set(Object.freeze([]))
        signals.selectedDrawingId.set(null)
      })
    },
  }
}

export type DrawingStateModule = ReturnType<typeof createDrawingState>
