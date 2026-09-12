// 锚定弹层的「外部点击关闭」：统一监听器生命周期与命中判定，供 Dropdown / SymbolPopover 复用。

import { onBeforeUnmount, watch } from 'vue'

interface UseClickOutsideOptions {
  /** 返回为真时才监听外部点击；省略则视为始终启用 */
  enabled?: () => boolean
}

/**
 * 监听 document 的 pointerdown，点击落在 targets 之外时触发 onOutside。
 *
 * @param getTargets 命中即忽略的元素（触发器与弹层面板）
 * @param onOutside 命中外部点击时执行
 * @param options.enabled 按需启用，返回 false 时移除监听
 */
export function useClickOutside(
  getTargets: () => ReadonlyArray<HTMLElement | null>,
  onOutside: () => void,
  options: UseClickOutsideOptions = {},
) {
  /** 点击路径是否命中任一目标元素。 */
  function isInside(event: PointerEvent): boolean {
    const path = event.composedPath()
    return getTargets().some((target) => target !== null && path.includes(target))
  }

  function handlePointerDown(event: PointerEvent) {
    if (isInside(event)) return
    onOutside()
  }

  function attach() {
    document.addEventListener('pointerdown', handlePointerDown, true)
  }

  function detach() {
    document.removeEventListener('pointerdown', handlePointerDown, true)
  }

  const isEnabled = options.enabled ?? (() => true)
  watch(isEnabled, (active) => (active ? attach() : detach()), { immediate: true })
  onBeforeUnmount(detach)
}
