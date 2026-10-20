/** 指针捕获拖拽会话：统一开始、移动、结束与 lostpointercapture 重入保护。 */
import { onScopeDispose, type ShallowRef, shallowRef } from 'vue'

/** 一次拖拽会话的基准；调用方用它把位移换算成自己的位置或尺寸。 */
export interface PointerDragSession {
  readonly pointerId: number
  readonly startX: number
  readonly startY: number
}

/** 拖拽会话句柄；调用方只负责资格判断和坐标换算。 */
export interface PointerDragHandle {
  readonly dragging: ShallowRef<boolean>
  begin(event: PointerEvent): PointerDragSession | null
  move(event: PointerEvent): PointerDragSession | null
  end(event?: PointerEvent): void
}

/**
 * 绑定一个独占的指针捕获会话。
 * @param capture 返回承载 pointer capture 的元素；会话开始时必须可用
 * @returns 拖拽状态与 begin/move/end
 */
export function usePointerDragSession(capture: () => HTMLElement | null): PointerDragHandle {
  const dragging = shallowRef(false)
  let session: PointerDragSession | undefined

  /** 开始会话并捕获指针；已有会话或元素缺失时不重复开始。 */
  function begin(event: PointerEvent): PointerDragSession | null {
    const element = capture()
    if (session || !element) return null
    element.setPointerCapture(event.pointerId)
    session = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY }
    dragging.value = true
    return session
  }

  /** 只接受当前捕获指针的移动，返回会话供调用方计算位移。 */
  function move(event: PointerEvent): PointerDragSession | null {
    if (!session || event.pointerId !== session.pointerId) return null
    return session
  }

  /** 先清空会话再释放捕获，避免 lostpointercapture 重入。 */
  function end(event?: PointerEvent): void {
    if (event && session && event.pointerId !== session.pointerId) return
    const previous = session
    session = undefined
    dragging.value = false
    const element = capture()
    if (previous && element?.hasPointerCapture(previous.pointerId))
      element.releasePointerCapture(previous.pointerId)
  }

  onScopeDispose(end)
  return { dragging, begin, move, end }
}
