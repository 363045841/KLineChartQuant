/** Controlled anchored surfaces share positioning and open/close synchronization. */
import { computed, type Ref, watch } from 'vue'
import { useAnchoredPopover } from './useAnchoredPopover.js'
import type { AnchoredPlacement, PopoverOrigin } from './types.js'

export type SurfaceAnchor =
  | { readonly kind: 'element'; readonly element: HTMLElement }
  | ({ readonly kind: 'point' } & Readonly<PopoverOrigin>)

interface SurfaceProps {
  open: boolean
  anchor: SurfaceAnchor | null
  placement?: AnchoredPlacement
  offset?: number
  restoreFocusTo?: HTMLElement | null
}

export function useAnchoredSurface(
  props: SurfaceProps,
  panel: Readonly<Ref<HTMLElement | null>>,
  onOpen: () => void,
  onClose: () => void,
) {
  const trigger = computed(() => (props.anchor?.kind === 'element' ? props.anchor.element : null))
  const origin = computed(() => (props.anchor?.kind === 'point' ? props.anchor : null))
  const popover = useAnchoredPopover({
    trigger,
    panel,
    origin,
    restoreFocusTo: () => props.restoreFocusTo ?? trigger.value,
    placement: () => props.placement ?? 'auto',
    offset: () => props.offset ?? (origin.value ? 0 : 4),
    maxHeight: 'min(420px, calc(100vh - 24px))',
    onOpen,
    onClose,
  })

  watch(
    [() => props.open, trigger, origin],
    ([open]) => {
      if (open) popover.show()
      else popover.hide()
    },
    { flush: 'post', immediate: true },
  )

  return { ...popover, trigger }
}
