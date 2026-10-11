import { type CSSProperties, computed, nextTick, type Ref, shallowRef, toValue, watch } from 'vue'
import { startFloatingPosition } from './floatingPosition.js'
import type { UseAnchoredPopoverOptions } from './types.js'

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
      placement: toValue(options.placement) ?? 'auto',
      matchTriggerWidth: toValue(options.matchTriggerWidth) ?? false,
      maxHeight: toValue(options.maxHeight),
    }),
    async (state, _previous, onCleanup) => {
      const lifetime = new AbortController()
      onCleanup(() => lifetime.abort())
      if (!state.open || !state.trigger || !state.panel) {
        measured.value = {}
        return
      }
      await nextTick()
      if (lifetime.signal.aborted) return
      await startFloatingPosition(
        {
          ...state,
          trigger: state.trigger,
          panel: state.panel,
          offset: options.offset ?? 4,
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
    panelStyle: computed<CSSProperties>(() => ({
      ...BASE_STYLE,
      ...measured.value,
      zIndex: native ? undefined : 'var(--klc-z-index-popover, 1010)',
      display: open.value ? undefined : 'none',
    })),
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
  return anchored
    ? useAnchorPosition(options, anchorName)
    : useFloatingPosition(options, open, native, onError)
}
