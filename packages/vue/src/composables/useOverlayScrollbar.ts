/** 浮层滚动条：原生容器负责滚动，滑块仅在滚动或拖动期间显示。 */
import { computed, onScopeDispose, type Ref, ref } from 'vue'

const HIDE_DELAY_MS = 700
const MIN_THUMB_HEIGHT = 24

/** 根据容器实际滚动位置派生滑块，并处理拖动和延迟隐藏。 */
export function useOverlayScrollbar(viewport: Ref<HTMLElement | null>) {
  const visible = ref(false)
  const thumbHeight = ref(0)
  const thumbTop = ref(0)
  const thumbStyle = computed(() => ({
    height: `${thumbHeight.value}px`,
    transform: `translateY(${thumbTop.value}px)`,
  }))
  let hideTimer: ReturnType<typeof setTimeout> | undefined
  let dragging = false
  let startY = 0
  let startScrollTop = 0

  /** 停止滚动后隐藏滑块，拖动期间始终保持可见。 */
  function scheduleHide(): void {
    clearTimeout(hideTimer)
    if (!dragging) {
      hideTimer = setTimeout(() => {
        visible.value = false
      }, HIDE_DELAY_MS)
    }
  }

  /** 滚动事件读取真实几何，不维护第二份滚动位置。 */
  function onScroll(): void {
    const element = viewport.value
    if (!element) return
    const { clientHeight, scrollHeight, scrollTop } = element
    const range = scrollHeight - clientHeight
    if (range <= 0 || clientHeight === 0) {
      visible.value = false
      return
    }
    thumbHeight.value = Math.min(
      clientHeight,
      Math.max(MIN_THUMB_HEIGHT, clientHeight ** 2 / scrollHeight),
    )
    thumbTop.value = ((clientHeight - thumbHeight.value) * scrollTop) / range
    visible.value = true
    scheduleHide()
  }

  /** 捕获指针，使移出滑块后仍可继续拖动。 */
  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !viewport.value || !(event.currentTarget instanceof HTMLElement))
      return
    event.preventDefault()
    dragging = true
    startY = event.clientY
    startScrollTop = viewport.value.scrollTop
    clearTimeout(hideTimer)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  /** 把滑块移动距离映射为原生容器滚动距离。 */
  function onPointerMove(event: PointerEvent): void {
    const element = viewport.value
    if (!dragging || !element) return
    const travel = element.clientHeight - thumbHeight.value
    if (travel <= 0) return
    element.scrollTop =
      startScrollTop +
      ((event.clientY - startY) * (element.scrollHeight - element.clientHeight)) / travel
  }

  /** 释放指针后恢复自动隐藏。 */
  function onPointerEnd(): void {
    dragging = false
    scheduleHide()
  }

  onScopeDispose(() => clearTimeout(hideTimer))
  return { visible, thumbStyle, onScroll, onPointerDown, onPointerMove, onPointerEnd }
}
