/**
 * useAnchoredPopover：锚定在触发按钮上的弹层（菜单、下拉、气泡）。
 *
 * 平台优先：
 * - 支持 Popover API 时，面板使用 `popover="auto"` 进入 top layer，触发按钮通过
 *   `popovertarget` 成为 invoker。浏览器负责轻触关闭、Esc（close watcher，可与
 *   原生 dialog 正确嵌套）与“同时只开一个 auto popover”。
 * - 支持 CSS anchor positioning 时，用 `anchor-name` / `position-anchor` /
 *   `position-area` 定位，并以 `position-try-fallbacks` 处理翻转，不需要 JS 同步坐标。
 * - 不支持 anchor positioning 时（如 Safari < 26），按需动态加载 `@floating-ui/dom`
 *   计算坐标；支持的浏览器不会下载这段代码。
 * - 不支持 Popover API 时（旧浏览器、测试 DOM），退化为 fixed 定位 + 外部点击/Esc 关闭。
 *
 * 打开状态以 Vue 的 `open` 为唯一事实源：原生模式下由 `beforetoggle` 事件同步。
 */
import {
  type CSSProperties,
  computed,
  type MaybeRefOrGetter,
  nextTick,
  onBeforeUnmount,
  type Ref,
  readonly,
  ref,
  toValue,
  useId,
  watch,
} from 'vue'

import { useClickOutside } from '../useClickOutside.js'
import { supportsAnchorPositioning, supportsPopover } from './platform.js'

/** 面板相对触发器的方向；auto 按可用空间选择上下方向。 */
export type AnchoredPlacement = 'auto' | 'top' | 'bottom'

export interface UseAnchoredPopoverOptions {
  trigger: Readonly<Ref<HTMLElement | null>>
  panel: Readonly<Ref<HTMLElement | null>>
  placement?: MaybeRefOrGetter<AnchoredPlacement>
  /** 面板与触发器的间距（px）。 */
  offset?: number
  /** 面板最小宽度与触发器一致。 */
  matchTriggerWidth?: MaybeRefOrGetter<boolean>
  /** 面板最大高度（CSS 长度），会再与可用空间取较小值。 */
  maxHeight?: MaybeRefOrGetter<string | undefined>
  /** 禁用时不能打开。 */
  disabled?: MaybeRefOrGetter<boolean>
  /** 面板已可见（原生模式在 toggle 事件之后，可安全移动焦点）。 */
  onOpen?: () => void
  onClose?: () => void
}

/** 退化模式下的互斥：打开一个弹层时关闭其他不包含它的弹层。 */
const fallbackOpen = new Set<{ close: () => void; panel: () => HTMLElement | null }>()

const VIEWPORT_PADDING = 8

/** 测试可替换的能力探测入口。 */
export const anchoredPopoverPlatform = {
  popover: supportsPopover,
  anchor: supportsAnchorPositioning,
}

export function useAnchoredPopover(options: UseAnchoredPopoverOptions) {
  const id = `klc-popover-${useId()}`
  const anchorName = `--${id.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const native = anchoredPopoverPlatform.popover()
  const anchored = anchoredPopoverPlatform.anchor()
  const offset = options.offset ?? 4

  const open = ref(false)
  /** floating-ui 计算出的坐标（仅 anchor positioning 不可用时使用）。 */
  const computedStyle = ref<CSSProperties>({})
  let cleanupAutoUpdate: (() => void) | null = null
  /** hide() 主动关闭时忽略随之触发的 beforetoggle。 */
  let programmaticClose = false

  const placement = computed(() => toValue(options.placement) ?? 'auto')
  const matchWidth = computed(() => toValue(options.matchTriggerWidth) ?? false)

  // ── 打开/关闭 ────────────────────────────────────────────────────────────

  const fallbackEntry = {
    close: () => hide(),
    panel: () => options.panel.value,
  }

  function setOpen(next: boolean): void {
    if (open.value === next) return
    open.value = next
    if (next) {
      void startPositioning()
      // 原生模式下 beforetoggle 时面板尚未显示（display: none，无法聚焦），
      // 等 toggle 事件再通知；退化模式在下一次渲染后通知。
      if (!native) void nextTick(() => open.value && options.onOpen?.())
    } else {
      stopPositioning()
      options.onClose?.()
    }
  }

  function show(): void {
    if (toValue(options.disabled) || open.value) return
    const panel = options.panel.value
    if (native && panel) {
      try {
        panel.showPopover()
      } catch {
        // 面板已打开或尚未连接到文档。
      }
      return
    }
    for (const entry of [...fallbackOpen]) {
      const otherPanel = entry.panel()
      // 嵌套弹层（触发器位于另一个弹层内）保持父级打开。
      if (otherPanel && options.trigger.value && otherPanel.contains(options.trigger.value))
        continue
      entry.close()
    }
    fallbackOpen.add(fallbackEntry)
    setOpen(true)
  }

  function hide(hideOptions: { restoreFocus?: boolean } = {}): void {
    if (!open.value) return
    const panel = options.panel.value
    const restoreFocus =
      (hideOptions.restoreFocus ?? false) || (panel?.contains(document.activeElement) ?? false)
    if (native && panel) {
      programmaticClose = true
      try {
        panel.hidePopover()
      } catch {
        // 已被浏览器关闭。
      }
      programmaticClose = false
    }
    fallbackOpen.delete(fallbackEntry)
    setOpen(false)
    if (restoreFocus) options.trigger.value?.focus()
  }

  function toggle(): void {
    if (open.value) hide()
    else show()
  }

  /** 原生模式：浏览器发起的开关（invoker 点击、轻触关闭、Esc）在这里同步到 Vue。 */
  function onBeforeToggle(event: Event): void {
    const next = (event as Event & { newState?: string }).newState === 'open'
    if (next) {
      if (toValue(options.disabled)) {
        event.preventDefault()
        return
      }
      setOpen(true)
      return
    }
    if (programmaticClose) return
    // Esc 或轻触关闭：焦点原本在面板内时还给触发器，避免焦点落到 body。
    const panel = options.panel.value
    const focusInside = panel?.contains(document.activeElement) ?? false
    setOpen(false)
    if (focusInside) queueMicrotask(() => options.trigger.value?.focus())
  }

  /** 原生模式：面板已显示。 */
  function onToggle(event: Event): void {
    if ((event as Event & { newState?: string }).newState === 'open' && open.value) {
      options.onOpen?.()
    }
  }

  /** 触发器点击：原生模式由 `popovertarget` 处理，退化模式手动切换。 */
  function onTriggerClick(): void {
    if (!native) toggle()
  }

  // 退化模式下的轻触关闭与 Esc。
  useClickOutside(
    () => [options.trigger.value, options.panel.value],
    () => hide(),
    { enabled: () => open.value && !native },
  )

  function onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !open.value) return
    // 阻止默认行为，避免同一次 Esc 同时关闭外层原生 dialog。
    event.preventDefault()
    event.stopPropagation()
    hide({ restoreFocus: true })
  }

  watch(
    () => open.value && !native,
    (active) => {
      if (active) document.addEventListener('keydown', onDocumentKeydown, true)
      else document.removeEventListener('keydown', onDocumentKeydown, true)
    },
  )

  // ── 定位 ────────────────────────────────────────────────────────────────

  async function startPositioning(): Promise<void> {
    if (anchored && native) return
    const trigger = options.trigger.value
    const panel = options.panel.value
    if (!trigger || !panel) return
    const {
      autoUpdate,
      computePosition,
      flip,
      offset: offsetMw,
      shift,
      size,
    } = await import('@floating-ui/dom')
    if (!open.value || cleanupAutoUpdate) return
    const update = async () => {
      const preferTop = placement.value === 'top'
      const result = await computePosition(trigger, panel, {
        strategy: 'fixed',
        placement: preferTop ? 'top-start' : 'bottom-start',
        middleware: [
          offsetMw(offset),
          placement.value === 'auto' ? flip({ padding: VIEWPORT_PADDING }) : undefined,
          shift({ padding: VIEWPORT_PADDING }),
          size({
            padding: VIEWPORT_PADDING,
            apply({ availableHeight, rects }) {
              const maxHeight = toValue(options.maxHeight)
              computedStyle.value = {
                ...computedStyle.value,
                maxHeight: maxHeight
                  ? `min(${maxHeight}, ${Math.max(0, availableHeight)}px)`
                  : `${Math.max(0, availableHeight)}px`,
                minWidth: matchWidth.value ? `${rects.reference.width}px` : undefined,
              }
            },
          }),
        ],
      })
      computedStyle.value = {
        ...computedStyle.value,
        top: `${Math.round(result.y)}px`,
        left: `${Math.round(result.x)}px`,
      }
    }
    cleanupAutoUpdate = autoUpdate(trigger, panel, () => void update())
  }

  function stopPositioning(): void {
    cleanupAutoUpdate?.()
    cleanupAutoUpdate = null
  }

  /** 绑定到触发按钮。 */
  const triggerBindings = computed(() => ({
    popovertarget: native ? id : undefined,
    'aria-expanded': open.value,
    'aria-controls': id,
    style: anchored ? ({ anchorName } as CSSProperties) : undefined,
  }))

  /** 绑定到面板根元素。 */
  const panelBindings = computed(() => {
    const maxHeight = toValue(options.maxHeight)
    const base: CSSProperties = {
      // 覆盖 UA 的 popover 默认样式（inset: 0; margin: auto）。
      position: 'fixed',
      inset: 'auto',
      margin: '0',
    }
    let style: CSSProperties
    if (anchored && native) {
      const area =
        placement.value === 'top' ? 'block-start span-inline-end' : 'block-end span-inline-end'
      style = {
        ...base,
        positionAnchor: anchorName,
        positionArea: area,
        positionTryFallbacks: 'flip-block, flip-inline, flip-block flip-inline',
        marginBlock: `${offset}px`,
        // auto：默认在下方，自然高度放不下时由 fallback 翻到上方；
        // 指定方向：固定在该方向，高度收缩到可用空间（100% = position-area 区域）。
        maxHeight:
          placement.value === 'auto'
            ? (maxHeight ?? `calc(100vh - ${2 * VIEWPORT_PADDING}px)`)
            : maxHeight
              ? `min(${maxHeight}, 100%)`
              : '100%',
        minWidth: matchWidth.value ? 'anchor-size(width)' : undefined,
      } as CSSProperties
    } else {
      style = {
        ...base,
        zIndex: native ? undefined : 'var(--klc-z-index-popover, 1010)',
        ...computedStyle.value,
        display: native || open.value ? undefined : 'none',
      }
      if (!computedStyle.value.maxHeight && maxHeight) style.maxHeight = maxHeight
    }
    return {
      id,
      popover: native ? 'auto' : undefined,
      style,
      onBeforetoggle: native ? onBeforeToggle : undefined,
      onToggle: native ? onToggle : undefined,
    }
  })

  onBeforeUnmount(() => {
    stopPositioning()
    fallbackOpen.delete(fallbackEntry)
    document.removeEventListener('keydown', onDocumentKeydown, true)
  })

  return {
    id,
    open: readonly(open),
    native,
    anchored,
    show,
    hide,
    toggle,
    onTriggerClick,
    triggerBindings,
    panelBindings,
  }
}
