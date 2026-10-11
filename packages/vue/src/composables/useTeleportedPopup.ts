/** Teleport 浮层的几何计算、DOM 测量与定位样式提交。 */
import { nextTick, type Ref, ref } from 'vue'

const VIEWPORT_MARGIN = 8
type PopupPlacement = 'auto' | 'top' | 'bottom'

/** 根据上下空间和指定方向，返回视口内的纵坐标与可用高度。 */
function computeVerticalPlacement(
  rect: DOMRect,
  popupHeight: number,
  viewportHeight: number,
  gap: number,
  placement: PopupPlacement,
): { top: number; maxHeight: number } {
  const spaceBelow = Math.max(0, viewportHeight - rect.bottom - gap - VIEWPORT_MARGIN)
  const spaceAbove = Math.max(0, rect.top - gap - VIEWPORT_MARGIN)
  const opensUpward =
    placement === 'top' ||
    (placement === 'auto' && popupHeight > spaceBelow && spaceAbove > spaceBelow)
  const maxHeight = opensUpward ? spaceAbove : spaceBelow
  const renderedHeight = Math.min(popupHeight, maxHeight)
  const top = opensUpward
    ? Math.max(VIEWPORT_MARGIN, rect.top - gap - renderedHeight)
    : rect.bottom + gap
  return { top, maxHeight }
}

/** 仅修正右侧溢出，保留触发元素左侧坐标和超宽浮层的现有规则。 */
function clampHorizontal(left: number, popupWidth: number, viewportWidth: number): number {
  return left + popupWidth > viewportWidth - VIEWPORT_MARGIN
    ? Math.max(VIEWPORT_MARGIN, viewportWidth - popupWidth - VIEWPORT_MARGIN)
    : left
}

/** 读取带变换的祖先 dialog 偏移，供 fixed 坐标转换使用。 */
function resolveDialogOffset(popup: HTMLElement | null): { top: number; left: number } {
  const dialog = popup?.closest('dialog')
  if (!dialog || !createsContainingBlock(dialog)) return { top: 0, left: 0 }
  const rect = dialog.getBoundingClientRect()
  return { top: rect.top, left: rect.left }
}

/** 元素是否因变换属性成为 fixed 后代的包含块。 */
function createsContainingBlock(element: Element): boolean {
  const style = getComputedStyle(element)
  return [style.transform, style.translate, style.scale].some(
    (value) => value !== undefined && value !== '' && value !== 'none',
  )
}

/** 管理浮层定位样式及显示期间的滚动、窗口尺寸监听。 */
export function useTeleportedPopup(
  triggerRef: Ref<HTMLElement | null>,
  popupRef: Ref<HTMLElement | null>,
  gap = 4,
  matchTriggerWidth = false,
  placement: PopupPlacement = 'auto',
) {
  const popupStyle = ref<Record<string, string>>({})

  /** 集中测量 DOM，将纯几何计算结果一次写入定位样式。 */
  function updatePosition() {
    const trigger = triggerRef.value
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const popup = popupRef.value
    const popupHeight = popup?.offsetHeight ?? 0
    const popupWidth = popup ? (matchTriggerWidth ? rect.width : popup.offsetWidth) : null
    const { top, maxHeight } = computeVerticalPlacement(
      rect,
      popupHeight,
      window.innerHeight,
      gap,
      placement,
    )
    const left =
      popupWidth === null ? rect.left : clampHorizontal(rect.left, popupWidth, window.innerWidth)

    // 祖先 dialog 带 transform/translate/scale（如进出场过渡中）时，内部的
    // position: fixed 元素改为相对 dialog 定位，需要把视口坐标转换为 dialog 的局部坐标；
    // 静止的 BaseModal 没有变换，直接使用视口坐标。
    const dialogOffset = resolveDialogOffset(popup)

    popupStyle.value = {
      position: 'fixed',
      top: `${top - dialogOffset.top}px`,
      left: `${left - dialogOffset.left}px`,
      maxHeight: `${maxHeight}px`,
      ...(matchTriggerWidth ? { width: `${rect.width}px` } : {}),
    }
  }

  /** 首次挂载前后测量，并在显示期间监听位置变化。 */
  function startPositionSync() {
    updatePosition()
    nextTick(() => updatePosition())
    document.addEventListener('scroll', updatePosition, { capture: true, passive: true })
    window.addEventListener('resize', updatePosition, { passive: true })
  }

  /** 移除显示期间的定位监听。 */
  function stopPositionSync() {
    document.removeEventListener('scroll', updatePosition, { capture: true })
    window.removeEventListener('resize', updatePosition)
  }

  return { popupStyle, updatePosition, startPositionSync, stopPositionSync }
}
