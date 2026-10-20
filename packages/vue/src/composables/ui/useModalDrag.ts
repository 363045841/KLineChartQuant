/** 原生 dialog 的标题栏拖动；用视口坐标定位，保留内部 fixed 浮层的定位基准。 */
import { type CSSProperties, computed, onScopeDispose, type Ref, shallowRef, watch } from 'vue'

/** 标题栏交互控件不作为拖动热区，插槽可用 data-modal-no-drag 显式排除。 */
const INTERACTIVE_SELECTOR =
  'button, a, input, select, textarea, [role="button"], [role="tab"], [contenteditable], [data-modal-no-drag]'

/** 绑定独立的弹窗拖动会话；关闭或禁用时结束捕获，重新打开时回到居中布局。 */
export function useModalDrag(
  dialog: Readonly<Ref<HTMLDialogElement | null>>,
  header: Readonly<Ref<HTMLElement | null>>,
  enabled: () => boolean,
  open: () => boolean,
) {
  const position = shallowRef<{ left: number; top: number } | null>(null)
  const dragging = shallowRef(false)
  let session:
    | { pointerId: number; capture: HTMLElement; x: number; y: number; left: number; top: number }
    | undefined
  const dragStyle = computed<CSSProperties>(() =>
    position.value
      ? {
          position: 'fixed',
          inset: 'auto',
          margin: '0',
          left: `${position.value.left}px`,
          top: `${position.value.top}px`,
        }
      : {},
  )

  /** 约束弹窗边界，标题栏始终留在当前所属窗口的可见区域内。 */
  function moveTo(left: number, top: number): void {
    const element = dialog.value
    const ownerWindow = element?.ownerDocument.defaultView
    if (!element || !ownerWindow) return
    const rect = element.getBoundingClientRect()
    const next = {
      left: Math.max(0, Math.min(left, ownerWindow.innerWidth - rect.width)),
      top: Math.max(0, Math.min(top, ownerWindow.innerHeight - rect.height)),
    }
    if (position.value?.left !== next.left || position.value?.top !== next.top)
      position.value = next
  }

  /** 释放捕获前先清空会话，避免 lostpointercapture 重入。 */
  function stopDrag(event?: PointerEvent): void {
    if (event && session && event.pointerId !== session.pointerId) return
    const previous = session
    session = undefined
    dragging.value = false
    if (previous?.capture.hasPointerCapture(previous.pointerId))
      previous.capture.releasePointerCapture(previous.pointerId)
  }

  /** 左键或主触点按住标题栏时记录弹窗实际位置，避免从居中布局开始拖动时跳变。 */
  function startDrag(event: PointerEvent): void {
    const element = dialog.value
    const capture = header.value
    if (
      !enabled() ||
      !open() ||
      !element?.open ||
      !capture ||
      session ||
      event.button !== 0 ||
      event.isPrimary === false
    )
      return
    if (
      event
        .composedPath()
        .some(
          (target) =>
            target instanceof Element && target !== capture && target.matches(INTERACTIVE_SELECTOR),
        )
    )
      return
    event.preventDefault()
    const rect = element.getBoundingClientRect()
    session = {
      pointerId: event.pointerId,
      capture,
      x: event.clientX,
      y: event.clientY,
      left: rect.left,
      top: rect.top,
    }
    capture.setPointerCapture(event.pointerId)
    moveTo(rect.left, rect.top)
    dragging.value = true
  }

  /** 只消费当前捕获指针，指针移出标题栏后仍可连续拖动。 */
  function drag(event: PointerEvent): void {
    if (!session || event.pointerId !== session.pointerId) return
    moveTo(session.left + event.clientX - session.x, session.top + event.clientY - session.y)
  }

  /** 窗口或内容尺寸变化后收回越界位置，不改变尚未拖动过的居中布局。 */
  function keepInViewport(): void {
    if (position.value && dialog.value?.open) moveTo(position.value.left, position.value.top)
  }

  watch(
    dialog,
    (element, _previous, cleanup) => {
      const ownerWindow = element?.ownerDocument.defaultView
      if (!element || !ownerWindow) return
      const observer = new ResizeObserver(keepInViewport)
      observer.observe(element)
      ownerWindow.addEventListener('resize', keepInViewport)
      cleanup(() => {
        stopDrag()
        observer.disconnect()
        ownerWindow.removeEventListener('resize', keepInViewport)
      })
    },
    { flush: 'post' },
  )
  watch(
    [enabled, open],
    ([canDrag, isOpen]) => {
      stopDrag()
      if (!canDrag || isOpen) position.value = null
    },
    { flush: 'sync' },
  )
  onScopeDispose(stopDrag)

  return { dragging, dragStyle, startDrag, drag, stopDrag }
}
