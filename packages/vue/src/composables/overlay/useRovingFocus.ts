/**
 * useRovingFocus：菜单 / 列表框的键盘导航（WAI-ARIA APG menu、listbox 模式）。
 *
 * - ArrowDown / ArrowUp 在可用项之间循环移动焦点；
 * - Home / End 跳到首项 / 末项；
 * - 可打印字符做 typeahead（500ms 内连续输入累积前缀）；
 * - 维护 roving tabindex：当前项 tabindex=0，其余 -1，Tab 只进出一次。
 *
 * Enter / Space 交给项本身（原生 button 的激活行为），这里不拦截。
 */
import type { Ref } from 'vue'

export interface UseRovingFocusOptions {
  /** 项选择器，默认匹配 menuitem / option。禁用项通过 :disabled 与 aria-disabled 排除。 */
  itemSelector?: string
  /** 到达首尾后是否循环，默认 true。 */
  loop?: boolean
}

const DEFAULT_ITEM_SELECTOR =
  '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"]'
const TYPEAHEAD_RESET_MS = 500

export function useRovingFocus(
  container: Readonly<Ref<HTMLElement | null>>,
  options: UseRovingFocusOptions = {},
) {
  const selector = options.itemSelector ?? DEFAULT_ITEM_SELECTOR
  const loop = options.loop ?? true
  let typeahead = ''
  let typeaheadTimer: ReturnType<typeof setTimeout> | undefined

  function items(): HTMLElement[] {
    const root = container.value
    if (!root) return []
    return [...root.querySelectorAll<HTMLElement>(selector)].filter(
      (item) =>
        !(item as HTMLButtonElement).disabled && item.getAttribute('aria-disabled') !== 'true',
    )
  }

  function focusAt(list: HTMLElement[], index: number): void {
    const target = list[index]
    if (!target) return
    for (const item of list) item.tabIndex = item === target ? 0 : -1
    target.focus()
  }

  function currentIndex(list: HTMLElement[]): number {
    const active = document.activeElement
    return list.findIndex((item) => item === active || item.contains(active))
  }

  /** 聚焦首项；`preferSelector` 命中时优先聚焦它（如 listbox 的已选项）。 */
  function focusFirst(preferSelector?: string): void {
    const list = items()
    if (preferSelector) {
      const preferred = list.findIndex((item) => item.matches(preferSelector))
      if (preferred >= 0) return focusAt(list, preferred)
    }
    focusAt(list, 0)
  }

  function focusLast(): void {
    const list = items()
    focusAt(list, list.length - 1)
  }

  function move(delta: number): void {
    const list = items()
    if (!list.length) return
    const index = currentIndex(list)
    let next = index < 0 ? (delta > 0 ? 0 : list.length - 1) : index + delta
    if (loop) next = (next + list.length) % list.length
    else next = Math.min(Math.max(next, 0), list.length - 1)
    focusAt(list, next)
  }

  function matchTypeahead(char: string): void {
    clearTimeout(typeaheadTimer)
    typeahead += char.toLocaleLowerCase()
    typeaheadTimer = setTimeout(() => {
      typeahead = ''
    }, TYPEAHEAD_RESET_MS)
    const list = items()
    const start = Math.max(currentIndex(list), 0)
    // 单字符重复输入时从下一项开始，便于在同首字母项之间循环。
    const offset = typeahead.length === 1 ? 1 : 0
    for (let step = 0; step < list.length; step += 1) {
      const index = (start + offset + step) % list.length
      const label = (list[index]?.textContent ?? '').trim().toLocaleLowerCase()
      if (label.startsWith(typeahead)) {
        focusAt(list, index)
        return
      }
    }
  }

  /** 绑定到容器的 keydown；返回 true 表示事件已处理。 */
  function onKeydown(event: KeyboardEvent): boolean {
    if (event.altKey || event.ctrlKey || event.metaKey) return false
    switch (event.key) {
      case 'ArrowDown':
        move(1)
        break
      case 'ArrowUp':
        move(-1)
        break
      case 'Home':
        focusFirst()
        break
      case 'End':
        focusLast()
        break
      default:
        if (event.key.length === 1 && event.key !== ' ') {
          matchTypeahead(event.key)
          break
        }
        return false
    }
    event.preventDefault()
    return true
  }

  return { items, focusFirst, focusLast, move, onKeydown }
}
