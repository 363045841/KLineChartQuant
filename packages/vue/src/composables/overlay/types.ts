import type { MaybeRefOrGetter, Ref } from 'vue'

/** Explicit directions stay fixed; auto may flip to fit the viewport. */
export type AnchoredPlacement = 'auto' | 'top' | 'bottom'

/** 坐标锚点矩形；提供时面板相对该矩形弹出，不依赖触发器元素。 */
export interface PopoverOrigin {
  x: number
  y: number
  /** 虚拟参考矩形的宽度；指针锚点省略时为 0。 */
  width?: number
  /** 虚拟参考矩形的高度；指针锚点省略时为 0。 */
  height?: number
}

export interface UseAnchoredPopoverOptions {
  trigger: Readonly<Ref<HTMLElement | null>>
  panel: Readonly<Ref<HTMLElement | null>>
  /** 坐标锚点：设置后改用原点矩形定位，右键菜单等无触发器入口使用。 */
  origin?: MaybeRefOrGetter<PopoverOrigin | null>
  /** 无触发器时，关闭后的焦点归还目标。 */
  restoreFocusTo?: () => HTMLElement | null
  placement?: MaybeRefOrGetter<AnchoredPlacement>
  /** Distance between the trigger and panel, in pixels. */
  offset?: number
  /** Use the trigger width as the panel's minimum width. */
  matchTriggerWidth?: MaybeRefOrGetter<boolean>
  /** CSS height limit, additionally constrained by available space. */
  maxHeight?: MaybeRefOrGetter<string | undefined>
  disabled?: MaybeRefOrGetter<boolean>
  /** Called once per opening, after the panel's content is rendered. */
  onOpen?: () => void
  onClose?: () => void
}
