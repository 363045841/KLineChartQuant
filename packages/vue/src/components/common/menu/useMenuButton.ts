/**
 * 锚点按钮：普通按钮只提供菜单的定位锚点，菜单由 MenuSurface 受控渲染。
 * 按钮本身是普通 button 语义，不复用下拉触发器的外观变量与实现。
 */
import { computed, type ComputedRef, shallowRef } from 'vue'
import type { MenuAnchor, MenuPopupSemantics } from './dropMenuTypes.js'
import { useMenuAnchor } from './useMenuAnchor.js'

export interface MenuButtonState {
  /** v-bind 给锚点按钮：aria 关系、点击开合与方向键打开。 */
  readonly buttonProps: ComputedRef<{
    'aria-haspopup': MenuPopupSemantics
    'aria-expanded': boolean
    onPointerdown: () => void
    onClick: (event: MouseEvent) => void
    onKeydown: (event: KeyboardEvent) => void
  }>
  /** v-bind 给 MenuSurface：开关、锚点与打开后是否移入焦点。 */
  readonly menuProps: ComputedRef<{
    open: boolean
    anchor: MenuAnchor | null
    focusOnOpen: boolean
    'onUpdate:open': (next: boolean) => void
  }>
}

/**
 * 创建锚点按钮的菜单绑定。
 *
 * @param focusOpenMenu 键盘打开后把焦点移入面板的入口
 * @param semantics 弹出面板的无障碍语义；含行内控件时传 dialog
 * @returns 开关、按钮属性、菜单属性与关闭入口
 */
export function useMenuButton(
  focusOpenMenu?: () => void,
  semantics: MenuPopupSemantics = 'menu',
): MenuButtonState {
  const menu = useMenuAnchor()
  // 键盘打开才把焦点交进菜单；指针打开只预置 tabindex，避免菜单项常驻高亮。
  const focusOnOpen = shallowRef(false)
  let wasOpenOnPointerDown = false

  function openAt(element: HTMLElement, focus: boolean): void {
    focusOnOpen.value = focus
    menu.anchorTo(element)
  }

  const buttonProps = computed(() => ({
    'aria-haspopup': semantics,
    'aria-expanded': menu.open.value,
    onPointerdown(): void {
      wasOpenOnPointerDown = menu.open.value
    },
    onClick(event: MouseEvent): void {
      const keyboard = event.detail === 0
      const shouldClose = menu.open.value || (!keyboard && wasOpenOnPointerDown)
      wasOpenOnPointerDown = false
      const element = event.currentTarget
      if (!(element instanceof HTMLElement)) return
      if (shouldClose) menu.close()
      else openAt(element, keyboard)
    },
    onKeydown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && menu.open.value) {
        event.preventDefault()
        event.stopPropagation()
        menu.close()
        return
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      event.preventDefault()
      const element = event.currentTarget
      if (!(element instanceof HTMLElement)) return
      if (menu.open.value && focusOpenMenu) focusOpenMenu()
      else openAt(element, true)
    },
  }))

  const menuProps = computed(() => ({ ...menu.bindings.value, focusOnOpen: focusOnOpen.value }))

  return { buttonProps, menuProps }
}
