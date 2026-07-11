import { createSubState } from '../../foundation/reactivity/signal'
import type { DrawingToolType } from '../chartTypes'
import type { DrawingObject } from '../../foundation/plugin/index'

export function createDrawingState() {
  const { signals, readonly } = createSubState({
    drawingTool: null as DrawingToolType | null,
    drawings: [] as ReadonlyArray<DrawingObject>,
  })

  return {
    readonly,
    signals,

    actions: {
      setDrawingTool(tool: DrawingToolType | null) {
        signals.drawingTool.set(tool)
      },

      setDrawings(drawings: ReadonlyArray<DrawingObject>) {
        signals.drawings.set(drawings)
      },

      clearDrawings() {
        signals.drawings.set([])
      },
    },

    dispose() {
      signals.drawingTool.set(null)
      signals.drawings.set([])
    },
  }
}

export type DrawingStateModule = ReturnType<typeof createDrawingState>