import { ref, nextTick, type Ref } from 'vue'

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
    const top = opensUpward
      ? Math.max(margin, rect.top - gap - renderedHeight)
      : rect.bottom + gap

    popupStyle.value = {
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
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
