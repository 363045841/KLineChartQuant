/**
 * 输入面：把指针、滚轮、原生滚动与捏合手势分派给交互、缩放和绘图会话。
 *
 * 只持有 DOM 元素与几个命令端口，不读取图表状态。
 */

import type { ChartDom } from '../types.js'
import type { InteractionController } from '../../controller/interaction.js'
import type { ViewportScrollBridge } from '../../viewport/viewportScrollBridge.js'
import type { DrawingToolId } from '../../drawing/index.js'

/** 绘图工具按下/移动/抬起的处理器；由绘图会话按当前工具提供。 */
export interface DrawingPointerController {
  readonly onPointerDown?: (event: PointerEvent, container: HTMLElement) => boolean
  readonly onPointerMove?: (event: PointerEvent, container: HTMLElement) => boolean
  readonly onPointerUp?: (event: PointerEvent, container: HTMLElement) => boolean
}

/** 按事件类型选取绘图会话处理器。 */
function resolveDrawingPointerHandler(
  event: PointerEvent,
  controller: DrawingPointerController | undefined,
): ((event: PointerEvent, container: HTMLElement) => boolean) | undefined {
  if (event.type === 'pointerdown') return controller?.onPointerDown
  if (event.type === 'pointermove') return controller?.onPointerMove
  if (event.type === 'pointerup') return controller?.onPointerUp
  return undefined
}

/** 输入面依赖的命令端口。 */
export interface ChartInputDependencies {
  readonly dom: ChartDom
  readonly interaction: InteractionController
  readonly scrollBridge: ViewportScrollBridge
  /** 当前绘图工具；`cursor` 表示未进入绘制。 */
  readonly drawingTool: () => DrawingToolId
  readonly allowZoom: () => boolean
  readonly clearDrawingHover: () => void
  readonly finishNavigation: () => void
  readonly panTo: (scroll: number) => boolean
  readonly leftLoadBufferWidth: () => number
  readonly stopMotion: () => void
  readonly wheelZoom: (
    deltaY: number,
    viewportX: number,
    deltaMode: number,
    ctrlKey: boolean,
  ) => void
  readonly pinchZoom: (delta: number, centerClientX: number) => void
}

/** 图表实例的唯一输入入口。 */
export class ChartInputSurface {
  private readonly pointerHandlers: Record<
    string,
    (event: PointerEvent, isRightAxis: boolean, hadPointer: boolean) => boolean
  >

  constructor(private readonly deps: ChartInputDependencies) {
    this.pointerHandlers = {
      pointerdown: (event, isRightAxis) => {
        if (isRightAxis) this.deps.interaction.onRightAxisPointerDown(event)
        else this.deps.interaction.onPointerDown(event)
        return false
      },
      pointermove: (event, isRightAxis) => {
        if (!isRightAxis) {
          this.deps.interaction.onPointerMove(event)
          return false
        }
        this.deps.clearDrawingHover()
        this.deps.interaction.onRightAxisPointerMove(event)
        return false
      },
      pointerup: (event, isRightAxis, hadPointer) => {
        if (isRightAxis) this.deps.interaction.onRightAxisPointerUp(event)
        else this.deps.interaction.onPointerUp(event)
        if (hadPointer) this.deps.finishNavigation()
        return false
      },
      pointerleave: (event, isRightAxis) => {
        this.deps.clearDrawingHover()
        if (isRightAxis) this.deps.interaction.onRightAxisPointerLeave(event)
        else this.deps.interaction.onPointerLeave(event)
        return false
      },
      pointercancel: (event) => {
        this.deps.interaction.onPointerCancel(event)
        return false
      },
      lostpointercapture: (event) => {
        this.deps.interaction.onLostPointerCapture(event)
        return false
      },
    }
  }

  /** 统一指针入口；绘图会话优先，其次交给交互控制器。 */
  handlePointerEvent(
    event: PointerEvent,
    drawingController?: DrawingPointerController,
  ): boolean {
    if (event.type === 'pointerdown') this.deps.stopMotion()
    // 鼠标右键与中键留给宿主上下文菜单，不进入平移或绘图会话。
    if (event.type === 'pointerdown' && event.pointerType === 'mouse' && event.button !== 0)
      return false
    const isRightAxis = this.deps.dom.rightAxisLayer.contains(event.target as Node)
    const hadPointer = event.type === 'pointerup' && this.deps.interaction.isPointerDown()
    const drawingHandler = resolveDrawingPointerHandler(event, drawingController)
    if (drawingHandler?.call(drawingController, event, this.deps.dom.container)) {
      // 绘图预览只在光标工具之外呈十字线，cursor 工具保持拖拽光标。
      if (
        event.type === 'pointermove' &&
        !isRightAxis &&
        this.deps.drawingTool() !== 'cursor'
      ) {
        this.deps.interaction.onPointerMove(event)
      }
      return true
    }
    return this.pointerHandlers[event.type]?.(event, isRightAxis, hadPointer) ?? false
  }

  /** 滚轮：价格轴围绕价位缩放，绘图区缩放时间轴。 */
  handleWheel(event: WheelEvent): void {
    this.deps.interaction.stopInertia()
    if (event.target instanceof Node && this.deps.dom.rightAxisLayer.contains(event.target)) {
      this.deps.interaction.onRightAxisWheel(event)
      return
    }
    if (!this.deps.allowZoom()) return
    const rect = this.deps.dom.container.getBoundingClientRect()
    this.deps.wheelZoom(event.deltaY, event.clientX - rect.left, event.deltaMode, event.ctrlKey)
  }

  /** 原生横向滚动：先确认是渲染器外部来源，再写回导航。 */
  handleScroll(): void {
    const container = this.deps.dom.container
    if (!container || !this.deps.scrollBridge.isExternalScroll(container.scrollLeft)) return
    if (this.deps.panTo(container.scrollLeft - this.deps.leftLoadBufferWidth())) {
      this.deps.interaction.onScroll()
      this.deps.finishNavigation()
    }
  }

  /** 双指捏合：delta 为正放大。 */
  handlePinch(delta: number, centerClientX: number): void {
    if (!this.deps.allowZoom()) return
    this.deps.pinchZoom(delta, centerClientX)
  }
}
