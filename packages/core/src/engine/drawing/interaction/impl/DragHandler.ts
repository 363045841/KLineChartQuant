import type { DrawingViewportPort } from '../../../../controllers/types.js'
import {
  anchorToScreen,
  isScreenPoint,
  midpoint,
  resolveDrawingPointer,
  screenToAnchor,
} from '../../geometry/impl/coordinateUtils.js'
import type { ResolveDrawingPointerOptions } from '../../geometry/types.js'
import type { DrawingObject } from '../../types.js'
import type { DragFollow, DrawingDragTarget } from '../types.js'
import { resolveAnchorFollowers, resolveVerticalHandleAnchors } from './dragPolicy.js'

// ---- Types ----

export interface DragState {
  drawings: DrawingObject[]
  target: DrawingDragTarget
  startMouse: { x: number; y: number }
}

/** 按位移系数求锚点的新屏幕坐标：系数为 0 的分量保持不动，-1 的分量反向。 */
function offsetScreen(
  screen: { x: number; y: number },
  dx: number,
  dy: number,
  follow: DragFollow | undefined,
): { x: number; y: number } {
  return {
    x: screen.x + dx * (follow?.time ?? 1),
    y: screen.y + dy * (follow?.price ?? 1),
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
   * @param target 命中目标（锚点 / 线段中点手柄 / 整体）
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
   * options.magnet 仅在锚点/手柄拖拽分支生效：命中点绝对跟随指针，磁吸随指针落点
   * 收敛到 OHLC（修饰键语义由调用方 resolveMagnetOptions 统一分发）；
   * 整体拖拽是位移增量语义，全体锚点平移，无单一落点基准，不吸附。
   */
  handleDragMove(
    e: PointerEvent,
    container: HTMLElement,
    adapter: DrawingViewportPort,
    options?: ResolveDrawingPointerOptions,
  ): DrawingObject[] | null {
    if (!this.dragState) return null

    const target = this.dragState.target
    const magnet = target.type === 'all' ? undefined : options?.magnet
    const pointer = resolveDrawingPointer(e, container, adapter, magnet ? { magnet } : undefined)
    const primary = this.dragState.drawings[0]
    if (!pointer || !primary || pointer.paneId !== primary.paneId) return null
    if (target.type === 'anchor') {
      return [this.moveAnchor(primary, target.index, pointer, adapter)]
    }
    if (target.type === 'vertical-handle') {
      return [this.moveVerticalHandle(primary, target.lineIndex, pointer, adapter)]
    }
    const dx = pointer.x - this.dragState.startMouse.x
    const dy = pointer.y - this.dragState.startMouse.y
    return this.dragState.drawings.map((drawing) => this.moveDrawing(drawing, dx, dy, adapter))
  }

  /**
   * 移动命中锚点所在的移动组：命中锚点落在指针上，组内其余锚点按同一屏幕位移跟随。
   * @param drawing 拖拽的图元
   * @param index 命中锚点下标
   * @param pointer 指针解析出的落点锚点
   * @param adapter 视口与坐标换算查询
   */
  private moveAnchor(
    drawing: DrawingObject,
    index: number,
    pointer: NonNullable<ReturnType<typeof resolveDrawingPointer>>,
    adapter: DrawingViewportPort,
  ): DrawingObject {
    const snapshot = this.dragState?.drawings[0]
    const origin = snapshot?.anchors[index]
    const originScreen = origin ? anchorToScreen(origin, drawing.paneId, adapter) : null
    if (!isScreenPoint(originScreen)) return drawing

    const dx = pointer.x - originScreen.x
    const dy = pointer.y - originScreen.y
    const anchors = drawing.anchors.map((anchor) => ({ ...anchor }))
    for (const moving of resolveAnchorFollowers(drawing.kind, index)) {
      if (moving.index === index) {
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
      const offset = offsetScreen(screen, dx, dy, moving.follow)
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
   * 拖拽线段中点垂直手柄：指针 Y 相对手柄中点的偏移换算成价格增量，
   * 对该线的两个锚点同增同减，时间与 futureOffset 保持不变（这条线只沿价格轴平移）。
   * @param drawing 拖拽的图元
   * @param lineIndex 手柄所在线在线表中的下标
   * @param pointer 指针解析出的落点锚点
   * @param adapter 视口与坐标换算查询
   */
  private moveVerticalHandle(
    drawing: DrawingObject,
    lineIndex: number,
    pointer: NonNullable<ReturnType<typeof resolveDrawingPointer>>,
    adapter: DrawingViewportPort,
  ): DrawingObject {
    const snapshot = this.dragState?.drawings[0]
    const pair = resolveVerticalHandleAnchors(drawing.kind, lineIndex)
    if (!snapshot || !pair) return drawing

    const [from, to] = pair
    const origin = this.anchorMidpoint(snapshot, from, to, adapter)
    if (!origin) return drawing

    const priceDelta =
      adapter.yToPrice(drawing.paneId, pointer.y) - adapter.yToPrice(drawing.paneId, origin.y)
    const anchors = drawing.anchors.map((anchor) => ({ ...anchor }))
    for (const index of pair) {
      const anchor = anchors[index]
      if (anchor) anchors[index] = { ...anchor, price: anchor.price + priceDelta }
    }
    return { ...drawing, anchors }
  }

  /** 两个锚点的屏幕中点；任一端不可投影时返回 null。 */
  private anchorMidpoint(
    drawing: DrawingObject,
    fromIndex: number,
    toIndex: number,
    adapter: DrawingViewportPort,
  ): { x: number; y: number } | null {
    const from = drawing.anchors[fromIndex]
    const to = drawing.anchors[toIndex]
    const a = from ? anchorToScreen(from, drawing.paneId, adapter) : null
    const b = to ? anchorToScreen(to, drawing.paneId, adapter) : null
    if (!isScreenPoint(a) || !isScreenPoint(b)) return null
    return midpoint(a, b)
  }

  /**
   * 对图元的全部锚点应用同一屏幕位移，用于整体拖拽。
   * @param drawing 拖拽的图元
   * @param dx 屏幕 X 位移（px）
   * @param dy 屏幕 Y 位移（px）
   * @param adapter 视口与坐标换算查询
   */
  private moveDrawing(
    drawing: DrawingObject,
    dx: number,
    dy: number,
    adapter: DrawingViewportPort,
  ): DrawingObject {
    const anchors = drawing.anchors.map((anchor) => ({ ...anchor }))
    for (const [index, anchor] of anchors.entries()) {
      const screen = anchorToScreen(anchor, drawing.paneId, adapter)
      if (!screen) continue
      if (screen.type === 'horizontal') {
        anchors[index] = {
          ...anchor,
          type: 'horizontal',
          price: adapter.yToPrice(drawing.paneId, screen.y + dy),
        }
        continue
      }
      if (screen.type === 'vertical') {
        const resolved = screenToAnchor(screen.x + dx, 0, drawing.paneId, adapter)
        if (resolved)
          anchors[index] = {
            ...anchor,
            type: 'vertical',
            time: resolved.time,
            futureOffset: resolved.futureOffset,
          }
        continue
      }
      // 整体拖拽始终使用完整位移，不按分量过滤。
      const resolved = screenToAnchor(screen.x + dx, screen.y + dy, drawing.paneId, adapter)
      if (resolved) {
        anchors[index] = {
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
