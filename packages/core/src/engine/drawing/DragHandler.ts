import type { DrawingChartAdapter } from '../../controllers/types'
import type { DrawingObject, PersistedDrawingAnchor } from '../../foundation/plugin/index'

import { anchorToScreen, isScreenPoint, resolveDrawingPointer, screenToAnchor } from './coordinateUtils'

// ---- Types ----

export interface DragState {
  drawings: DrawingObject[]
  anchorIndex?: number
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

  /** 拖拽中的主图元 ID。 */
  getDraggingDrawingId(): string | null {
    return this.dragState?.drawings[0]?.id ?? null
  }

  /** 拖拽中的全部图元 ID。 */
  getDraggingDrawingIds(): ReadonlyArray<string> {
    return this.dragState?.drawings.map((drawing) => drawing.id) ?? []
  }

  /**
   * 开始拖拽。
   * @param drawing 拖拽的图元
   * @param anchorIndex 拖拽单个锚点时传锚点下标；拖拽整线时不传
   * @param mouseX 起始鼠标 X（屏幕 px）
   * @param mouseY 起始鼠标 Y（屏幕 px）
   */
  startDrag(
    drawings: ReadonlyArray<DrawingObject>,
    anchorIndex: number | undefined,
    mouseX: number,
    mouseY: number,
  ): void {
    if (drawings.length === 0) return
    this.dragState = {
      drawings: drawings.map((drawing) => ({
        ...drawing,
        anchors: drawing.anchors.map((anchor) => ({ ...anchor })),
      })),
      anchorIndex,
      startMouse: { x: mouseX, y: mouseY },
    }
  }

  /**
   * 基于拖拽快照生成整组图元的临时覆盖，不修改已确认状态。
   */
  handleDragMove(
    e: PointerEvent,
    container: HTMLElement,
    adapter: DrawingChartAdapter,
  ): DrawingObject[] | null {
    if (!this.dragState) return null

    const pointer = resolveDrawingPointer(e, container, adapter)
    const primary = this.dragState.drawings[0]
    if (!pointer || !primary || pointer.paneId !== primary.paneId) return null
    if (this.dragState.anchorIndex !== undefined) {
      return [this.moveAnchor(primary, pointer)]
    }
    const dx = pointer.x - this.dragState.startMouse.x
    const dy = pointer.y - this.dragState.startMouse.y
    return this.dragState.drawings.map((drawing) => this.moveDrawing(drawing, dx, dy, adapter))
  }

  /** 移动单个锚点，保持多选之外的图元不受影响。 */
  private moveAnchor(drawing: DrawingObject, pointer: NonNullable<ReturnType<typeof resolveDrawingPointer>>): DrawingObject {
    const anchors = drawing.anchors.map((anchor) => ({ ...anchor }))
    const index = this.dragState?.anchorIndex
    if (index === undefined) return drawing
    anchors[index] = { ...anchors[index]!, time: pointer.time, futureOffset: pointer.futureOffset, price: pointer.price }
    if (drawing.kind === 'flat-line' && index === 1 && anchors.length >= 3) {
      anchors[2] = { ...anchors[2]!, time: pointer.time, futureOffset: pointer.futureOffset }
    }
    return { ...drawing, anchors }
  }

  /** 对一个图元的全部锚点应用同一屏幕位移。 */
  private moveDrawing(
    drawing: DrawingObject,
    dx: number,
    dy: number,
    adapter: DrawingChartAdapter,
  ): DrawingObject {
    const anchors = drawing.anchors.map((anchor) => ({ ...anchor }))
    for (let index = 0; index < anchors.length; index++) {
      const anchor = anchors[index]!
      const screen = anchorToScreen(anchor, drawing.paneId, adapter)
      if (!screen) continue
      if (screen.type === 'horizontal') {
        anchors[index] = { ...anchor, type: 'horizontal', price: adapter.yToPrice(drawing.paneId, screen.y + dy) }
        continue
      }
      if (screen.type === 'vertical') {
        const resolved = screenToAnchor(screen.x + dx, 0, drawing.paneId, adapter)
        if (resolved) anchors[index] = { ...anchor, type: 'vertical', time: resolved.time, futureOffset: resolved.futureOffset }
        continue
      }
      if (!isScreenPoint(screen)) continue
      const resolved = screenToAnchor(screen.x + dx, screen.y + dy, drawing.paneId, adapter)
      if (resolved) {
        anchors[index] = { ...anchor, time: resolved.time, futureOffset: resolved.futureOffset, price: resolved.price }
      }
    }
    return { ...drawing, anchors }
  }

  /** 结束拖拽，清空状态 */
  endDrag(): void {
    this.dragState = null
  }
}
