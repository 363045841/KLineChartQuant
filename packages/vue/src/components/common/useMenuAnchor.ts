/**
 * 受控菜单的锚点状态：右键菜单在指针处打开，锚点按钮在自身位置打开。
 * 组件不再提供命令式 openAt，宿主通过这里的状态驱动 MenuSurface。
 */
import { computed, type ComputedRef, shallowRef, type ShallowRef } from 'vue'
import type { MenuAnchor } from '@vue-src/components/common/dropMenuTypes.js'

export interface MenuAnchorState {
  /** 面板当前是否展开。 */
  readonly open: ShallowRef<boolean>
  /** 当前锚点；指针打开时是坐标，锚点按钮打开时是该按钮。 */
  readonly anchor: ShallowRef<MenuAnchor | null>
  /** 在指针坐标处打开；已打开时只更新位置。 */
  anchorAt(x: number, y: number): void
  /** 以按钮元素为锚点打开；按钮只提供定位，不承担下拉触发器语义。 */
  anchorTo(element: HTMLElement): void
  /** 关闭面板。 */
  close(): void
  /** 直接 v-bind 给 MenuSurface 的受控绑定。 */
  readonly bindings: ComputedRef<{
    open: boolean
    anchor: MenuAnchor | null
    'onUpdate:open': (next: boolean) => void
  }>
}

/**
 * 创建受控菜单的锚点状态。
 *
 * @returns 开关、锚点、两种打开入口与 v-bind 绑定
 */
export function useMenuAnchor(): MenuAnchorState {
  const open = shallowRef(false)
  const anchor = shallowRef<MenuAnchor | null>(null)

  function anchorAt(x: number, y: number): void {
    anchor.value = { kind: 'point', x, y }
    open.value = true
  }

  function anchorTo(element: HTMLElement): void {
    anchor.value = { kind: 'element', element }
    open.value = true
  }

  function close(): void {
    open.value = false
  }

  const bindings = computed(() => ({
    open: open.value,
    anchor: anchor.value,
    'onUpdate:open': (next: boolean) => {
      open.value = next
    },
  }))

  return { open, anchor, anchorAt, anchorTo, close, bindings }
}
