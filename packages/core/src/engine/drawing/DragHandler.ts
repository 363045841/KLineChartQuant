import type { DrawingViewportPort } from '../../controllers/types.js'
import type { DrawingObject, PersistedDrawingAnchor } from '../../foundation/plugin/index.js'
import type { ResolveDrawingPointerOptions } from './coordinateUtils.js'
import {
  anchorToScreen,
  isScreenPoint,
  resolveDrawingPointer,
  screenToAnchor,
} from './coordinateUtils.js'
import type { DragFollowAxis, DrawingDragTarget } from './dragPolicy.js'
import { resolveDragAnchors } from './dragPolicy.js'

// ---- Types ----

export interface DragState {
  drawings: DrawingObject[]
  target: DrawingDragTarget
  startMouse: { x: number; y: number }
}

/** 按位移分量求锚点的新屏幕坐标：只跟时间时保持 Y，只跟价格时保持 X。 */
function offsetScreen(
  screen: { x: number; y: number },
  dx: number,
  dy: number,
  axis: DragFollowAxis | undefined,
): { x: number; y: number } {
  return {
    x: axis === 'price' ? screen.x : screen.x + dx,
    y: axis === 'time' ? screen.y : screen.y + dy,
  }
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
   * @param drawings 参与本次拖拽的图元
   * @param target 命中目标（点 / 边 / 整体）
   * @param mouseX 起始鼠标 X（屏幕 px）
   * @param mouseY 起始鼠标 Y（屏幕 px）
   */
  startDrag(
    drawings: ReadonlyArray<DrawingObject>,
    target: DrawingDragTarget,
    mouseX: number,
    mouseY: number,
  ): void {
    if (drawings.length === 0) return
    this.dragState = {
      drawings: drawings.map((drawing) => ({
        ...drawing,
        anchors: drawing.anchors.map((anchor) => ({ ...anchor })),
      })),
      target,
      startMouse: { x: mouseX, y: mouseY },
    }
  }

  /**
   * 基于拖拽快照生成整组图元的临时覆盖，不修改已确认状态。
   * options.magnet 仅在锚点拖拽分支生效：被拖锚点绝对跟随指针，磁吸随指针落点
   * 收敛到 OHLC（修饰键语义由调用方 resolveMagnetOptions 统一分发）；
   * 整线拖拽是位移增量语义，全体锚点平移，无单一落点基准，不吸附。
   */
  handleDragMove(
    e: PointerEvent,
    container: HTMLElement,
    adapter: DrawingViewportPort,
    options?: ResolveDrawingPointerOptions,
  ): DrawingObject[] | null {
    if (!this.dragState) return null

    const target = this.dragState.target
    const magnet = target.type === 'anchor' ? options?.magnet : undefined
    const pointer = resolveDrawingPointer(e, container, adapter, magnet ? { magnet } : undefined)
    const primary = this.dragState.drawings[0]
    if (!pointer || !primary || pointer.paneId !== primary.paneId) return null
    if (target.type === 'anchor') {
      return [this.moveAnchor(primary, target, pointer, adapter)]
    }
    const dx = pointer.x - this.dragState.startMouse.x
    const dy = pointer.y - this.dragState.startMouse.y
    return this.dragState.drawings.map((drawing) =>
      this.moveDrawing(drawing, target, dx, dy, adapter),
    )
  }

  /**
   * 移动命中锚点所在的移动组：命中锚点落在指针上，组内其余锚点按同一屏幕位移跟随。
   * @param drawing 拖拽的图元
   * @param target 锚点命中目标
   * @param pointer 指针解析出的落点锚点
   * @param adapter 视口与坐标换算查询
   */
  private moveAnchor(
    drawing: DrawingObject,
    target: Extract<DrawingDragTarget, { type: 'anchor' }>,
    pointer: NonNullable<ReturnType<typeof resolveDrawingPointer>>,
    adapter: DrawingViewportPort,
  ): DrawingObject {
    const snapshot = this.dragState?.drawings[0]
    const origin = snapshot?.anchors[target.index]
    const originScreen = origin ? anchorToScreen(origin, drawing.paneId, adapter) : null
    if (!isScreenPoint(originScreen)) return drawing

    const dx = pointer.x - originScreen.x
    const dy = pointer.y - originScreen.y
    const anchors = drawing.anchors.map((anchor) => ({ ...anchor }))
    for (const moving of resolveDragAnchors(drawing.kind, target, drawing.anchors.length)) {
      if (moving.index === target.index) {
        anchors[moving.index] = {
          ...anchors[moving.index]!,
          time: pointer.time,
          futureOffset: pointer.futureOffset,
          price: pointer.price,
        }
        continue
      }
      const follower = snapshot?.anchors[moving.index]
      const screen = follower ? anchorToScreen(follower, drawing.paneId, adapter) : null
      if (!isScreenPoint(screen)) continue
      const offset = offsetScreen(screen, dx, dy, moving.axis)
      const resolved = screenToAnchor(offset.x, offset.y, drawing.paneId, adapter)
      if (!resolved) continue
      anchors[moving.index] = {
        ...anchors[moving.index]!,
        time: resolved.time,
        futureOffset: resolved.futureOffset,
        price: resolved.price,
      }
    }
    return { ...drawing, anchors }
  }

  /**
   * 对命中目标解析出的移动组应用同一屏幕位移，跟随锚点按各自分量接受位移。
   * @param drawing 拖拽的图元
   * @param target 命中目标
   * @param dx 屏幕 X 位移（px）
   * @param dy 屏幕 Y 位移（px）
   * @param adapter 视口与坐标换算查询
   */
  private moveDrawing(
    drawing: DrawingObject,
    target: DrawingDragTarget,
    dx: number,
    dy: number,
    adapter: DrawingViewportPort,
  ): DrawingObject {
    const anchors = drawing.anchors.map((anchor) => ({ ...anchor }))
    for (const moving of resolveDragAnchors(drawing.kind, target, drawing.anchors.length)) {
      const anchor = anchors[moving.index]
      if (!anchor) continue
      const screen = anchorToScreen(anchor, drawing.paneId, adapter)
      if (!screen) continue
      if (screen.type === 'horizontal') {
        anchors[moving.index] = {
          ...anchor,
          type: 'horizontal',
          price: adapter.yToPrice(drawing.paneId, screen.y + dy),
        }
        continue
      }
      if (screen.type === 'vertical') {
        const resolved = screenToAnchor(screen.x + dx, 0, drawing.paneId, adapter)
        if (resolved)
          anchors[moving.index] = {
            ...anchor,
            type: 'vertical',
            time: resolved.time,
            futureOffset: resolved.futureOffset,
          }
        continue
      }
      const offset = offsetScreen(screen, dx, dy, moving.axis)
      const resolved = screenToAnchor(offset.x, offset.y, drawing.paneId, adapter)
      if (resolved) {
        anchors[moving.index] = {
          ...anchor,
          time: resolved.time,
          futureOffset: resolved.futureOffset,
          price: resolved.price,
        }
      }
    }
    return { ...drawing, anchors }
  }

  /** 结束拖拽，清空状态 */
  endDrag(): void {
    this.dragState = null
  }
}
