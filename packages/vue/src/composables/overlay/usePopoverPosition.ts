import { type CSSProperties, computed, nextTick, type Ref, shallowRef, toValue, watch } from 'vue'
import { type PointReference, startFloatingPosition } from './floatingPosition.js'
import type { PopoverOrigin, UseAnchoredPopoverOptions } from './types.js'

const BASE_STYLE: CSSProperties = { position: 'fixed', inset: 'auto', margin: '0' }

/** CSS anchor 只负责块轴方向与起点对齐；行内方向、居中一律交给测量定位。 */
function canUseAnchorPosition(options: UseAnchoredPopoverOptions): boolean {
  const placement = toValue(options.placement) ?? 'auto'
  return placement !== 'left' && placement !== 'right' && (options.align ?? 'start') === 'start'
}

function useAnchorPosition(options: UseAnchoredPopoverOptions, anchorName: string) {
  const triggerStyle = computed<CSSProperties>(() => ({ anchorName }))
  const panelStyle = computed<CSSProperties>(() => {
    const placement = toValue(options.placement) ?? 'auto'
    const maxHeight = toValue(options.maxHeight)
    return {
      ...BASE_STYLE,
      positionAnchor: anchorName,
      // 进入本函数前已确认是块轴方向，left / right 不会走到这里。
      positionArea:
        placement === 'top' ? 'block-start span-inline-end' : 'block-end span-inline-end',
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

/** 把坐标矩形包装成虚拟参考元素，定位与视口翻转仍由 Floating UI 负责。 */
function pointReference(origin: PopoverOrigin): PointReference {
  return {
    getBoundingClientRect: () =>
      new DOMRect(origin.x, origin.y, origin.width ?? 0, origin.height ?? 0),
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
      align: options.align ?? 'start',
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
          align: state.align,
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
      const offset = options.offset ?? 4
      // 首次测量完成前不显示：兜底位置不一定等于翻转后的最终位置，
      // 先画再纠正会让面板从下方瞬移到上方。
      const positioned = Object.keys(measured.value).length > 0
      return {
        ...BASE_STYLE,
        // 首次测量完成前先落在锚点下方，避免原生 popover 先在默认位置闪一帧。
        ...(origin
          ? {
              left: `${origin.x}px`,
              top: `${origin.y + (origin.height ?? 0) + offset}px`,
            }
          : {}),
        ...measured.value,
        ...(positioned ? {} : { opacity: 0, pointerEvents: 'none' }),
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
  // 坐标锚点没有真实元素可做 CSS anchor；行内方向与居中由能力判断交给测量定位。
  return anchored &&
    options.origin === undefined &&
    options.positioning !== 'floating' &&
    canUseAnchorPosition(options)
    ? useAnchorPosition(options, anchorName)
    : useFloatingPosition(options, open, native, onError)
}
