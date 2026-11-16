/**
 * useTooltip：提示的显示状态机。
 *
 * 只负责延迟、分组预热与 Esc 关闭；定位交给共享的锚定浮层（测量策略，锚在触发控件上）。
 */
import { useAnchoredPopover } from '@vue-src/composables/overlay/useAnchoredPopover.js'
import type { AnchoredPlacement } from '@vue-src/composables/overlay/types.js'
import { onBeforeUnmount, onScopeDispose, type Ref, watch } from 'vue'

/** 提示相对触发控件的显示方向；提示没有 auto 语义，方向必须显式。 */
export type TooltipPlacement = Exclude<AnchoredPlacement, 'auto'>

/** useTooltip 配置；读取函数形式传入以保持响应式。 */
export interface UseTooltipOptions {
  /** 触发层元素；提示的定位锚点与语义归属都由它决定。 */
  trigger: Readonly<Ref<HTMLElement | null>>
  /** 提示面板元素。 */
  panel: Readonly<Ref<HTMLElement | null>>
  /** 相对触发元素的显示位置，默认 right */
  placement?: () => TooltipPlacement
  /** 提示框与触发元素的间距（px），默认 8 */
  offset?: () => number
  /** 显示延迟（ms），默认 300 */
  showDelay?: () => number
  /** 隐藏延迟（ms），默认 0 */
  hideDelay?: () => number
  /** 为 true 时屏蔽显示 */
  disabled?: () => boolean
}

/**
 * 分组「先延迟、后即时」：一个提示刚隐藏（或仍在显示）时，相邻触发器的提示立即出现，
 * 对齐 Reka TooltipProvider 的 skipDelayDuration 与 Vercel 指南。
 */
const SKIP_DELAY_MS = 300
let visibleCount = 0
let lastHiddenAt = Number.NEGATIVE_INFINITY

/** 测试用：重置分组状态。 */
export function resetTooltipGroup(): void {
  visibleCount = 0
  lastHiddenAt = Number.NEGATIVE_INFINITY
}

function groupIsWarm(): boolean {
  return visibleCount > 0 || Date.now() - lastHiddenAt < SKIP_DELAY_MS
}

/**
 * 悬浮提示框状态机。
 * @param options 锚点、位置、延迟与禁用配置
 * @returns 显示状态、面板绑定与事件处理器
 */
export function useTooltip(options: UseTooltipOptions) {
  /** 提示定位走测量引擎：需要居中，且锚点是包装层里的控件而非包装层本身。 */
  const popover = useAnchoredPopover({
    trigger: options.trigger,
    panel: options.panel,
    placement: () => options.placement?.() ?? 'right',
    offset: options.offset?.() ?? 8,
    // 提示不参与浏览器的 auto 轻量关闭：避免悬停到别的按钮时把已打开的菜单顶掉。
    popover: 'manual',
    // 提示在锚点一侧居中，不是菜单那样的贴起点对齐。
    align: 'center',
    positioning: 'floating',
    disabled: () => options.disabled?.() ?? false,
  })

  const visible = popover.open
  let showTimer: ReturnType<typeof setTimeout> | null = null
  let hideTimer: ReturnType<typeof setTimeout> | null = null
  /** 已请求展开但浏览器尚未确认：此时取消也必须收得回来。 */
  let revealRequested = false

  /** Esc 关闭当前提示（WCAG 1.4.13 可关闭），不阻止其他 Esc 处理。 */
  function onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    cancelTimers()
    revealRequested = false
    popover.hide({ restoreFocus: false })
  }

  // 提示进入可见态期间才需要监听 Esc，避免每个实例常驻全局监听。
  watch(visible, (open) => {
    if (open) {
      visibleCount += 1
      revealRequested = false
      document.addEventListener('keydown', onDocumentKeydown, true)
      return
    }
    visibleCount = Math.max(0, visibleCount - 1)
    lastHiddenAt = Date.now()
    document.removeEventListener('keydown', onDocumentKeydown, true)
  })

  function cancelTimers(): void {
    if (showTimer) {
      clearTimeout(showTimer)
      showTimer = null
    }
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
  }

  function show(): void {
    if (options.disabled?.()) return
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
    if (visible.value || showTimer || revealRequested) return
    const reveal = () => {
      showTimer = null
      if (options.disabled?.()) return
      revealRequested = true
      popover.show()
    }
    if (groupIsWarm()) reveal()
    else showTimer = setTimeout(reveal, options.showDelay?.() ?? 300)
  }

  function hide(): void {
    if (showTimer) {
      clearTimeout(showTimer)
      showTimer = null
    }
    if (!visible.value && !revealRequested) return
    if (hideTimer) return
    hideTimer = setTimeout(() => {
      hideTimer = null
      revealRequested = false
      popover.hide({ restoreFocus: false })
    }, options.hideDelay?.() ?? 0)
  }

  function onPointerEnter(): void {
    show()
  }

  function onPointerLeave(): void {
    hide()
  }

  /** 仅在键盘聚焦（:focus-visible）时显示，避免鼠标点击后提示滞留。 */
  function onFocusIn(event: FocusEvent): void {
    const target = event.target as HTMLElement | null
    if (target?.matches(':focus-visible')) show()
  }

  function onFocusOut(): void {
    hide()
  }

  onBeforeUnmount(() => {
    cancelTimers()
    document.removeEventListener('keydown', onDocumentKeydown, true)
  })
  onScopeDispose(cancelTimers)

  return {
    id: popover.id,
    visible,
    panelBindings: popover.panelBindings,
    onPointerEnter,
    onPointerLeave,
    onFocusIn,
    onFocusOut,
  }
}
