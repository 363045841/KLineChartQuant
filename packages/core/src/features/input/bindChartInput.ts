/**
 * DOM 输入绑定：把宿主元素上的指针与滚轮事件转发给 ChartController。
 *
 * 平移、十字线、坐标轴拖拽、双指缩放（PinchTracker）都已在控制器内部实现，
 * 宿主只缺这层接线。Vue、React、Angular 与移动端 WebView 共用同一份实现，
 * 框架只负责提供元素和可选钩子（画线、区间选择等拦截）。
 */

import type { ChartController, DrawingControllerCallbacks } from '../../controllers/types.js'

/** 绑定只依赖控制器的两个输入入口，便于测试与替换。 */
export type ChartInputController = Pick<ChartController, 'handlePointerEvent' | 'handleWheelEvent'>

export interface ChartInputTargets {
  /** 绘图区，接收指针事件；画线、区间选择等拦截只作用于此处。 */
  surface: HTMLElement
  /** 接收滚轮的元素，缺省为 surface。绘图区与价格轴是兄弟节点时传它们的共同父节点。 */
  wheelTarget?: HTMLElement
  /** 价格轴等附加命中区，指针事件不经拦截直接交给控制器。 */
  axisTargets?: ReadonlyArray<HTMLElement>
}

export interface ChartInputHooks {
  /** 转发前调用；返回 false 丢弃该事件（例如 pointerleave 进入浮层）。 */
  beforePointer?: (e: PointerEvent) => boolean | undefined
  /** 传给 handlePointerEvent 的拦截器，返回 true 表示事件已被消费。 */
  intercept?: DrawingControllerCallbacks
  /** 控制器处理完后调用，用于宿主侧收尾（光标、悬停状态等）。 */
  afterPointer?: (e: PointerEvent) => void
}

export type ChartInputDisposer = () => void

const POINTER_EVENTS = [
  'pointerdown',
  'pointermove',
  'pointerup',
  'pointerleave',
  'pointercancel',
  'lostpointercapture',
] as const

/**
 * 在目标元素上注册输入监听，返回释放函数。
 *
 * surface 的 `touch-action` 设为 `none`，否则触屏浏览器会把单指拖动和双指缩放
 * 当作页面滚动与缩放，控制器收不到完整的指针序列。释放时恢复原内联值。
 */
export function bindChartInput(
  controller: ChartInputController,
  targets: ChartInputTargets,
  hooks: ChartInputHooks = {},
): ChartInputDisposer {
  const { surface, wheelTarget = surface, axisTargets = [] } = targets
  const cleanups: Array<() => void> = []

  const onSurfacePointer = (e: PointerEvent) => {
    if (hooks.beforePointer?.(e) === false) return
    controller.handlePointerEvent(e, hooks.intercept)
    hooks.afterPointer?.(e)
  }
  for (const type of POINTER_EVENTS) {
    surface.addEventListener(type, onSurfacePointer)
    cleanups.push(() => surface.removeEventListener(type, onSurfacePointer))
  }

  const onAxisPointer = (e: PointerEvent) => {
    controller.handlePointerEvent(e)
  }
  for (const axis of axisTargets) {
    for (const type of POINTER_EVENTS) {
      axis.addEventListener(type, onAxisPointer)
      cleanups.push(() => axis.removeEventListener(type, onAxisPointer))
    }
  }

  // 必须是非 passive 监听，否则 preventDefault 无效，滚轮会同时滚动页面。
  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    controller.handleWheelEvent(e)
  }
  wheelTarget.addEventListener('wheel', onWheel, { passive: false })
  cleanups.push(() => wheelTarget.removeEventListener('wheel', onWheel))

  const previousTouchAction = surface.style.touchAction
  surface.style.touchAction = 'none'
  cleanups.push(() => {
    surface.style.touchAction = previousTouchAction
  })

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    for (const cleanup of cleanups) cleanup()
  }
}
