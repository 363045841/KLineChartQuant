/** 绘图拖拽：由起始快照生成锚点移动，并约束回归通道的数据边界。 */
import type { DrawingViewportPort } from '@/controllers/types.js'
import { midpoint, type Point } from '@/foundation/geometry/index.js'
import {
  anchorToScreen,
  isScreenPoint,
  resolveDrawingPointer,
  screenToAnchor,
} from '../../geometry/impl/coordinateUtils.js'
import type { ResolveDrawingPointerOptions } from '../../geometry/types.js'
import type { DrawingObject, PersistedDrawingAnchor } from '../../types.js'
import type { DrawingSnapIndicator } from '../types.js'
import { type DragFollow, type DrawingDragTarget, DrawingTool } from '../types.js'
import { resolveAnchorFollowers, resolveLineHandle } from './dragPolicy.js'
import { toSnapIndicator } from './snapIndicator.js'

// ---- Types ----

interface DragState {
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
  /** 最近一次拖拽落点命中的磁吸点；只用于渲染高亮。 */
  private snapIndicator: DrawingSnapIndicator | null = null

  /** 当前是否有未结束的拖拽 */
  isDragging(): boolean {
    return this.dragState !== null
  }

  /** 当前拖拽的磁吸命中点；未命中或未开启磁吸时为 null。 */
  getSnapIndicator(): DrawingSnapIndicator | null {
    return this.snapIndicator
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
    this.snapIndicator = null
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
    const pointer = resolveDrawingPointer(e, container, adapter, {
      magnet: this.resolveDragMagnet(target, options),
      clampDataEnd:
        target.type === 'anchor' &&
        this.dragState.drawings[0]?.kind === DrawingTool.RegressionChannel,
    })
    this.snapIndicator = toSnapIndicator(pointer)
    const primary = this.dragState.drawings[0]
    if (!pointer || !primary || pointer.paneId !== primary.paneId) return null
    return this.moveByTarget(primary, target, pointer, adapter)
  }

  /** 整线拖拽是位移增量语义，没有单一落点，不吸附；锚点/手柄拖拽排除本次拖拽的图元。 */
  private resolveDragMagnet(
    target: DrawingDragTarget,
    options?: ResolveDrawingPointerOptions,
  ): ResolveDrawingPointerOptions['magnet'] {
    if (target.type === 'all' || options?.magnet === undefined) return undefined
    return {
      ...options.magnet,
      excludeDrawingIds: this.dragState?.drawings.map((drawing) => drawing.id) ?? [],
    }
  }

  /** 按命中目标分派拖拽位移；三种目标共用同一落点。 */
  private moveByTarget(
    primary: DrawingObject,
    target: DrawingDragTarget,
    pointer: NonNullable<ReturnType<typeof resolveDrawingPointer>>,
    adapter: DrawingViewportPort,
  ): DrawingObject[] {
    if (target.type === 'anchor') {
      return [this.moveAnchor(primary, target.index, pointer, adapter)]
    }
    if (target.type === 'line-handle') {
      return [this.moveLineHandle(primary, target.lineIndex, pointer, adapter)]
    }
    return this.moveSelection(pointer, adapter)
  }

  /** 整组选中图元共用受限位移，回归端点到达最后一根 K 线时保持组内间距。 */
  private moveSelection(
    pointer: NonNullable<ReturnType<typeof resolveDrawingPointer>>,
    adapter: DrawingViewportPort,
  ): DrawingObject[] {
    const state = this.dragState
    if (!state) return []
    const dx = state.drawings.reduce(
      (offset, drawing) => this.clampRegressionOffset(drawing, offset, adapter),
      pointer.x - state.startMouse.x,
    )
    const dy = pointer.y - state.startMouse.y
    return state.drawings.map((drawing) => this.moveDrawing(drawing, dx, dy, adapter))
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
    if (!origin) return drawing
    // 单轴锚点只写回自己拥有的坐标轴：水平线只改价格，垂直线只改时间。
    if (origin.type === 'horizontal' || origin.type === 'vertical')
      return this.moveSingleAxisAnchor(drawing, index, pointer)

    const originScreen = anchorToScreen(origin, drawing.paneId, adapter)
    if (!isScreenPoint(originScreen)) return drawing
    return this.followAnchorGroup(drawing, index, pointer, adapter, snapshot, originScreen)
  }

  /**
   * 命中锚点跟随指针，组内其余锚点按同一屏幕位移跟随。
   * @param drawing 拖拽的图元
   * @param index 命中锚点下标
   * @param pointer 指针解析出的落点锚点
   * @param adapter 视口与坐标换算查询
   * @param snapshot 拖拽起始快照
   * @param originScreen 起始锚点的屏幕坐标
   */
  private followAnchorGroup(
    drawing: DrawingObject,
    index: number,
    pointer: NonNullable<ReturnType<typeof resolveDrawingPointer>>,
    adapter: DrawingViewportPort,
    snapshot: DrawingObject | undefined,
    originScreen: Point,
  ): DrawingObject {
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
   * 拖拽单轴锚点：水平锚点只写价格，垂直锚点只写时间，另一根轴保持原值。
   * @param drawing 拖拽的图元
   * @param index 被拖拽的锚点下标
   * @param pointer 指针解析出的落点锚点
   * @returns 更新后的图元
   */
  private moveSingleAxisAnchor(
    drawing: DrawingObject,
    index: number,
    pointer: NonNullable<ReturnType<typeof resolveDrawingPointer>>,
  ): DrawingObject {
    const anchor = drawing.anchors[index]
    if (!anchor) return drawing
    const next: PersistedDrawingAnchor =
      anchor.type === 'horizontal'
        ? { ...anchor, type: 'horizontal', price: pointer.price }
        : { ...anchor, type: 'vertical', time: pointer.time, futureOffset: pointer.futureOffset }
    const anchors = drawing.anchors.map((item) => ({ ...item }))
    anchors[index] = next
    return { ...drawing, anchors }
  }

  /**
   * 拖拽线段中点手柄：指针沿该线声明的轴相对手柄中点的位移，换算成两个锚点的同一坐标增量，
   * 因此这条线只沿该轴平移、形状不变。
   * @param drawing 拖拽的图元
   * @param lineIndex 手柄所在线在线表中的下标
   * @param pointer 指针解析出的落点锚点
   * @param adapter 视口与坐标换算查询
   * @returns 更新后的图元；该线未开启手柄时原样返回
   */
  private moveLineHandle(
    drawing: DrawingObject,
    lineIndex: number,
    pointer: NonNullable<ReturnType<typeof resolveDrawingPointer>>,
    adapter: DrawingViewportPort,
  ): DrawingObject {
    const snapshot = this.dragState?.drawings[0]
    const handle = resolveLineHandle(drawing.kind, lineIndex)
    if (!snapshot || !handle) return drawing

    const fromAnchor = snapshot.anchors[handle.from]
    const toAnchor = snapshot.anchors[handle.to]
    if (!fromAnchor || !toAnchor) return drawing
    const fromScreen = anchorToScreen(fromAnchor, drawing.paneId, adapter)
    const toScreen = anchorToScreen(toAnchor, drawing.paneId, adapter)
    if (!isScreenPoint(fromScreen) || !isScreenPoint(toScreen)) return drawing

    const anchors = drawing.anchors.map((anchor) => ({ ...anchor }))
    const middle = midpoint(fromScreen, toScreen)
    if (handle.axis === 'price') {
      this.shiftLineByPrice(anchors, handle, drawing.paneId, pointer.y, middle.y, adapter)
    } else {
      this.shiftLineByTime(
        anchors,
        handle,
        drawing.paneId,
        fromScreen,
        toScreen,
        pointer.x - middle.x,
        adapter,
      )
    }
    return { ...drawing, anchors }
  }

  /** 价格轴平移：按指针与线段中点的价格差移动两个锚点。 */
  private shiftLineByPrice(
    anchors: PersistedDrawingAnchor[],
    handle: NonNullable<ReturnType<typeof resolveLineHandle>>,
    paneId: string,
    pointerY: number,
    middleY: number,
    adapter: DrawingViewportPort,
  ): void {
    const priceDelta = adapter.yToPrice(paneId, pointerY) - adapter.yToPrice(paneId, middleY)
    for (const index of [handle.from, handle.to]) {
      const anchor = anchors[index]
      if (anchor) anchors[index] = { ...anchor, price: anchor.price + priceDelta }
    }
  }

  /** 时间轴平移：两个锚点按同一屏幕 X 位移换算时间，价格保持不变。 */
  private shiftLineByTime(
    anchors: PersistedDrawingAnchor[],
    handle: NonNullable<ReturnType<typeof resolveLineHandle>>,
    paneId: string,
    fromScreen: Point,
    toScreen: Point,
    dx: number,
    adapter: DrawingViewportPort,
  ): void {
    for (const [index, screen] of [
      [handle.from, fromScreen],
      [handle.to, toScreen],
    ] as const) {
      const resolved = screenToAnchor(screen.x + dx, screen.y, paneId, adapter)
      const anchor = anchors[index]
      if (resolved && anchor)
        anchors[index] = { ...anchor, time: resolved.time, futureOffset: resolved.futureOffset }
    }
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

  /** 限制回归通道的整体水平位移，让较新端点停在最后一根 K 线中心。 */
  private clampRegressionOffset(
    drawing: DrawingObject,
    dx: number,
    adapter: DrawingViewportPort,
  ): number {
    if (drawing.kind !== DrawingTool.RegressionChannel) return dx
    const lastX = adapter.getXAtLogicalIndex(adapter.getDrawingData().length - 1)
    if (lastX === null) return dx
    return drawing.anchors.reduce((offset, anchor) => {
      const screen = anchorToScreen(anchor, drawing.paneId, adapter)
      return isScreenPoint(screen) ? Math.min(offset, lastX - screen.x) : offset
    }, dx)
  }

  /** 结束拖拽，清空状态 */
  endDrag(): void {
    this.dragState = null
    this.snapIndicator = null
  }
}
