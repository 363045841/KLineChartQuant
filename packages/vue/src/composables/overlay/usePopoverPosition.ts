import { type CSSProperties, computed, nextTick, type Ref, shallowRef, toValue, watch } from 'vue'
import { type PointReference, startFloatingPosition } from './floatingPosition.js'
import type { PopoverOrigin, UseAnchoredPopoverOptions } from './types.js'

const BASE_STYLE: CSSProperties = { position: 'fixed', inset: 'auto', margin: '0' }

function useAnchorPosition(options: UseAnchoredPopoverOptions, anchorName: string) {
  const triggerStyle = computed<CSSProperties>(() => ({ anchorName }))
  const panelStyle = computed<CSSProperties>(() => {
    const placement = toValue(options.placement) ?? 'auto'
    const maxHeight = toValue(options.maxHeight)
    return {
      ...BASE_STYLE,
      positionAnchor: anchorName,
      positionArea:
        placement === 'top' ? 'block-start span-inline-end' : 'block-end span-inline-end',
      // Only auto placement may flip to the opposite block direction.
      positionTryFallbacks:
        placement === 'auto' ? 'flip-block, flip-inline, flip-block flip-inline' : 'flip-inline',
      marginBlock: `${options.offset ?? 4}px`,
      maxHeight:
        placement === 'auto'
          ? (maxHeight ?? 'calc(100vh - 16px)')
          : maxHeight
            ? `min(${maxHeight}, 100%)`
            : '100%',
      minWidth: toValue(options.matchTriggerWidth) ? 'anchor-size(width)' : undefined,
    }
  })
  return { triggerStyle, panelStyle }
}

/** 把指针坐标包装成零尺寸虚拟元素，定位与视口翻转仍由 Floating UI 负责。 */
function pointReference(origin: PopoverOrigin): PointReference {
  return {
    getBoundingClientRect: () => new DOMRect(origin.x, origin.y, 0, 0),
  }
}

function useFloatingPosition(
  options: UseAnchoredPopoverOptions,
  open: Readonly<Ref<boolean>>,
  native: boolean,
  onError: () => void,
) {
  const measured = shallowRef<CSSProperties>({})
  watch(
    () => ({
      open: open.value,
      trigger: options.trigger.value,
      panel: options.panel.value,
      origin: toValue(options.origin) ?? null,
      placement: toValue(options.placement) ?? 'auto',
      matchTriggerWidth: toValue(options.matchTriggerWidth) ?? false,
      maxHeight: toValue(options.maxHeight),
    }),
    async (state, _previous, onCleanup) => {
      const lifetime = new AbortController()
      onCleanup(() => lifetime.abort())
      // 指针位置已经在面板样式里兜底，测量结果只用于翻转到可用方向。
      measured.value = {}
      const reference = state.origin ? pointReference(state.origin) : state.trigger
      if (!state.open || !reference || !state.panel) return
      await nextTick()
      if (lifetime.signal.aborted) return
      await startFloatingPosition(
        {
          reference,
          panel: state.panel,
          placement: state.placement,
          offset: options.offset ?? 4,
          matchTriggerWidth: state.matchTriggerWidth,
          maxHeight: state.maxHeight,
          apply: (style) => {
            measured.value = style
          },
          onError,
        },
        lifetime.signal,
      )
    },
    { immediate: true, flush: 'sync' },
  )
  return {
    triggerStyle: computed(() => undefined),
    panelStyle: computed<CSSProperties>(() => {
      const origin = toValue(options.origin)
      return {
        ...BASE_STYLE,
        // 首次测量完成前先落在指针位置，避免原生 popover 先在默认位置闪一帧。
        ...(origin ? { left: `${origin.x}px`, top: `${origin.y}px` } : {}),
        ...measured.value,
        zIndex: native ? undefined : 'var(--klc-z-index-popover, 1010)',
        display: open.value ? undefined : 'none',
      }
    }),
  }
}

/** Select one positioning strategy for the lifetime of the component. */
export function usePopoverPosition(
  options: UseAnchoredPopoverOptions,
  open: Readonly<Ref<boolean>>,
  native: boolean,
  anchored: boolean,
  anchorName: string,
  onError: () => void,
) {
  // 坐标锚点没有真实元素可做 CSS anchor，固定走 Floating UI。
  return anchored && options.origin === undefined
    ? useAnchorPosition(options, anchorName)
    : useFloatingPosition(options, open, native, onError)
}
