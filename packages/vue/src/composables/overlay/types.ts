import type { MaybeRefOrGetter, Ref } from 'vue'

/** Explicit directions stay fixed; auto may flip to fit the viewport. */
export type AnchoredPlacement = 'auto' | 'top' | 'bottom' | 'left' | 'right'

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
  /**
   * 原生 popover 的关闭策略：auto 由浏览器负责轻量关闭（菜单用），
   * manual 只由持有者决定（提示用，避免提示把正在打开的菜单顶掉）。
   */
  popover?: 'auto' | 'manual'
  /** 在锚点一侧的对齐方式：菜单贴起点，提示居中。 */
  align?: 'start' | 'center'
  /**
   * 定位策略：auto 在支持 CSS anchor positioning 时用原生锚定，否则回退 floating-ui；
   * floating 直接测量定位，用于锚点是包装层里的控件、且需要在锚点居中的提示。
   */
  positioning?: 'auto' | 'floating'
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
