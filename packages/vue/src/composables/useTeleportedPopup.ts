import { nextTick, type Ref, ref } from 'vue'

/** 元素是否因变换属性成为 fixed 后代的包含块。 */
function createsContainingBlock(element: Element): boolean {
  const style = getComputedStyle(element)
  return [style.transform, style.translate, style.scale].some(
    (value) => value !== undefined && value !== '' && value !== 'none',
  )
}

export function useTeleportedPopup(
  triggerRef: Ref<HTMLElement | null>,
  popupRef: Ref<HTMLElement | null>,
  gap = 4,
  matchTriggerWidth = false,
  placement: 'auto' | 'top' | 'bottom' = 'auto',
) {
  const popupStyle = ref<Record<string, string>>({})

  function updatePosition() {
    const trigger = triggerRef.value
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const popup = popupRef.value
    const margin = 8
    const viewportHeight = window.innerHeight
    const spaceBelow = Math.max(0, viewportHeight - rect.bottom - gap - margin)
    const spaceAbove = Math.max(0, rect.top - gap - margin)
    const popupHeight = popup?.offsetHeight ?? 0
    const opensUpward =
      placement === 'top' ||
      (placement === 'auto' && popupHeight > spaceBelow && spaceAbove > spaceBelow)
    const availableHeight = opensUpward ? spaceAbove : spaceBelow

    let left = rect.left
    if (popup) {
      const popupWidth = matchTriggerWidth ? rect.width : popup.offsetWidth
      const viewportWidth = window.innerWidth
      if (left + popupWidth > viewportWidth - margin) {
        left = Math.max(margin, viewportWidth - popupWidth - margin)
      }
    }

    const renderedHeight = Math.min(popupHeight, availableHeight)
    const top = opensUpward ? Math.max(margin, rect.top - gap - renderedHeight) : rect.bottom + gap

    // 祖先 dialog 带 transform/translate/scale（如进出场过渡中）时，内部的
    // position: fixed 元素改为相对 dialog 定位，需要把视口坐标转换为 dialog 的局部坐标；
    // 静止的 BaseModal 没有变换，直接使用视口坐标。
    const dialog = popup?.closest('dialog')
    const dialogRect =
      dialog && createsContainingBlock(dialog) ? dialog.getBoundingClientRect() : null

    popupStyle.value = {
      position: 'fixed',
      top: `${top - (dialogRect?.top ?? 0)}px`,
      left: `${left - (dialogRect?.left ?? 0)}px`,
      maxHeight: `${availableHeight}px`,
      ...(matchTriggerWidth ? { width: `${rect.width}px` } : {}),
    }
  }

  function startPositionSync() {
    updatePosition()
    nextTick(() => updatePosition())
    document.addEventListener('scroll', updatePosition, { capture: true, passive: true })
    window.addEventListener('resize', updatePosition, { passive: true })
  }

  function stopPositionSync() {
    document.removeEventListener('scroll', updatePosition, { capture: true })
    window.removeEventListener('resize', updatePosition)
  }

  return { popupStyle, updatePosition, startPositionSync, stopPositionSync }
}
