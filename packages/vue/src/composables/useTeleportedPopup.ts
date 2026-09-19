import { nextTick, type Ref, ref } from 'vue'

export function useTeleportedPopup(
  triggerRef: Ref<HTMLElement | null>,
  popupRef: Ref<HTMLElement | null>,
  gap = 4,
  matchTriggerWidth = false,
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
    const opensUpward = popupHeight > spaceBelow && spaceAbove > spaceBelow
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

    // BaseModal 的原生 dialog 使用 transform 居中。transform 会让内部的
    // position: fixed 元素改为相对 dialog 定位，因此需要把视口坐标转换为
    // dialog 的局部坐标；普通 Teleport 到 body 时仍直接使用视口坐标。
    const dialog = popup?.closest('dialog')
    const dialogRect = dialog?.getBoundingClientRect()

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
