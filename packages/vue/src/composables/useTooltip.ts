/**
 * useTooltip：悬浮提示框的显示状态与视口定位。
 * 触发元素与提示元素通过 ref 绑定；显示后测量尺寸并按 placement 计算 fixed 坐标，
 * 显示期间随滚动/缩放同步位置，离开或卸载时清理定时器与监听。
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

/** 提示框相对触发元素的显示位置。 */
export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

/** useTooltip 配置；读取函数形式传入以保持响应式。 */
export interface UseTooltipOptions {
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

/** 提示框与视口边缘的安全距离（px）。 */
const VIEWPORT_MARGIN = 6

/**
 * 悬浮提示框状态机。
 * @param options 位置、延迟与禁用配置
 * @returns 绑定 ref、显示状态、样式与事件处理器
 */
export function useTooltip(options: UseTooltipOptions = {}) {
  const triggerRef = ref<HTMLElement | null>(null)
  const tooltipRef = ref<HTMLElement | null>(null)
  const visible = ref(false)
  /** 尺寸测量完成前保持隐藏，避免在默认坐标处闪现。 */
  const styled = ref(false)
  const tooltipStyle = ref<Record<string, string>>({})

  let showTimer: ReturnType<typeof setTimeout> | null = null
  let hideTimer: ReturnType<typeof setTimeout> | null = null
  let syncing = false

  /** 将坐标限制在视口内。 */
  function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), Math.max(min, max))
  }

  /** 解析真实锚点：触发层为 display:contents 时无自身盒模型，取首个子元素。 */
  function resolveAnchor(): HTMLElement | null {
    const trigger = triggerRef.value
    if (!trigger) return null
    const first = trigger.firstElementChild
    return first instanceof HTMLElement ? first : trigger
  }

  /** 依据触发元素矩形与提示尺寸计算并写入 fixed 坐标。 */
  function updatePosition(): void {
    const trigger = resolveAnchor()
    const tooltip = tooltipRef.value
    if (!trigger || !tooltip) return

    const rect = trigger.getBoundingClientRect()
    const width = tooltip.offsetWidth
    const height = tooltip.offsetHeight
    const placement = options.placement?.() ?? 'right'
    const offset = options.offset?.() ?? 8

    let top: number
    let left: number
    if (placement === 'top' || placement === 'bottom') {
      left = rect.left + rect.width / 2 - width / 2
      top = placement === 'top' ? rect.top - offset - height : rect.bottom + offset
    } else {
      top = rect.top + rect.height / 2 - height / 2
      left = placement === 'left' ? rect.left - offset - width : rect.right + offset
    }

    left = clamp(left, VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN)
    top = clamp(top, VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN)

    tooltipStyle.value = { top: `${Math.round(top)}px`, left: `${Math.round(left)}px` }
    styled.value = true
  }

  /** 显示期间跟随滚动与缩放同步位置。 */
  function startSync(): void {
    if (syncing) return
    syncing = true
    document.addEventListener('scroll', updatePosition, { capture: true, passive: true })
    window.addEventListener('resize', updatePosition, { passive: true })
  }

  function stopSync(): void {
    if (!syncing) return
    syncing = false
    document.removeEventListener('scroll', updatePosition, { capture: true })
    window.removeEventListener('resize', updatePosition)
  }

  /** 取消待执行的显示/隐藏定时器。 */
  function clearTimers(): void {
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
    if (visible.value || showTimer) return
    showTimer = setTimeout(() => {
      showTimer = null
      if (options.disabled?.()) return
      visible.value = true
      styled.value = false
      nextTick(() => {
        updatePosition()
        startSync()
      })
    }, options.showDelay?.() ?? 300)
  }

  function hide(): void {
    if (showTimer) {
      clearTimeout(showTimer)
      showTimer = null
    }
    if (!visible.value || hideTimer) return
    hideTimer = setTimeout(() => {
      hideTimer = null
      visible.value = false
      stopSync()
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

  watch(
    () => options.disabled?.() ?? false,
    (disabled) => {
      if (disabled) hide()
    },
  )

  onBeforeUnmount(() => {
    clearTimers()
    stopSync()
  })

  return {
    triggerRef,
    tooltipRef,
    visible,
    styled,
    tooltipStyle,
    onPointerEnter,
    onPointerLeave,
    onFocusIn,
    onFocusOut,
  }
}
