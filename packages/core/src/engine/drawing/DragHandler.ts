import type { DrawingChartAdapter } from '../../controllers/types'
import type { DrawingObject, PersistedDrawingAnchor } from '../../foundation/plugin/index'

import { anchorToScreen, isScreenPoint, resolveDrawingPointer, screenToAnchor } from './coordinateUtils'

// ---- Types ----

export interface DragState {
  drawingId: string
  anchorIndex?: number
  snapshot: PersistedDrawingAnchor[]
  startMouse: { x: number; y: number }
}

/**
 * Manages drag state and handles drag-move mutations for drawings.
 * Does NOT own the drawings array — the caller retrieves and writes back.
 */
export class DragHandler {
  private dragState: DragState | null = null

  /** 当前是否有未结束的拖拽 */
  isDragging(): boolean {
    return this.dragState !== null
  }

  /** 拖拽中的图元 ID */
  getDraggingDrawingId(): string | null {
    return this.dragState?.drawingId ?? null
  }

  /**
   * 开始拖拽。
   * @param drawing 拖拽的图元
   * @param anchorIndex 拖拽单个锚点时传锚点下标；拖拽整线时不传
   * @param mouseX 起始鼠标 X（屏幕 px）
   * @param mouseY 起始鼠标 Y（屏幕 px）
   */
  startDrag(
    drawing: DrawingObject,
    anchorIndex: number | undefined,
    mouseX: number,
    mouseY: number,
  ): void {
    this.dragState = {
      drawingId: drawing.id,
      anchorIndex,
      snapshot: drawing.anchors.map((a) => ({ ...a })),
      startMouse: { x: mouseX, y: mouseY },
    }
  }

  /**
   * Handle drag-move for the given drawing, mutating its anchors.
   * @returns a new DrawingObject reference with updated anchors, or null if drag state is stale.
   */
  handleDragMove(
    drawing: DrawingObject,
    e: PointerEvent,
    container: HTMLElement,
    adapter: DrawingChartAdapter,
  ): DrawingObject | null {
    if (!this.dragState) return null

    const pointer = resolveDrawingPointer(e, container, adapter)
    const updatedAnchors = [...drawing.anchors]

    if (this.dragState.anchorIndex !== undefined) {
      // Dragging a single anchor point
      if (!pointer || pointer.paneId !== drawing.paneId) return null
      const idx = this.dragState.anchorIndex

      updatedAnchors[idx] = {
        ...updatedAnchors[idx]!,
        time: pointer.time,
        futureOffset: pointer.futureOffset,
        price: pointer.price,
      }

      // flat-line: third anchor's index/time follows the second
      if (drawing.kind === 'flat-line' && idx === 1 && updatedAnchors.length >= 3) {
        updatedAnchors[2] = {
          ...updatedAnchors[2]!,
          time: pointer.time,
          futureOffset: pointer.futureOffset,
        }
      }
    } else {
      // Dragging the entire line — offset all anchors by mouse delta
      if (!pointer || pointer.paneId !== drawing.paneId) return null
      if (drawing.kind === 'horizontal-line') {
        updatedAnchors[0] = {
          ...updatedAnchors[0]!,
          type: 'horizontal',
          time: undefined,
          futureOffset: undefined,
          price: pointer.price,
        }
        return { ...drawing, anchors: updatedAnchors }
      }
      if (drawing.kind === 'vertical-line') {
        updatedAnchors[0] = {
          ...updatedAnchors[0]!,
          type: 'vertical',
          time: pointer.time,
          futureOffset: pointer.futureOffset,
        }
        return { ...drawing, anchors: updatedAnchors }
      }
      const dx = pointer.x - this.dragState.startMouse.x
      const dy = pointer.y - this.dragState.startMouse.y

      for (let i = 0; i < drawing.anchors.length; i++) {
        const snap = this.dragState.snapshot[i]!
        const snapScreen = anchorToScreen(snap, drawing.paneId, adapter)
        if (!snapScreen || !isScreenPoint(snapScreen)) continue

        const targetX = snapScreen.x + dx
        const targetY = snapScreen.y + dy
        const newFromScreen = screenToAnchor(targetX, targetY, drawing.paneId, adapter)
        if (newFromScreen) {
          updatedAnchors[i] = {
            ...updatedAnchors[i]!,
            time: newFromScreen.time,
            futureOffset: newFromScreen.futureOffset,
            price: newFromScreen.price,
          }
        }
      }
    }

    return { ...drawing, anchors: updatedAnchors }
  }

  /** 结束拖拽，清空状态 */
  endDrag(): void {
    this.dragState = null
  }
}
