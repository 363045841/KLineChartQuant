/** Public facade: lifecycle and positioning are independent capabilities. */
import { computed, readonly, ref, useId } from 'vue'
import { supportsAnchorPositioning, supportsPopover } from './platform.js'
import type { UseAnchoredPopoverOptions } from './types.js'
import { usePopoverLifecycle } from './usePopoverLifecycle.js'
import { usePopoverPosition } from './usePopoverPosition.js'

export type { AnchoredPlacement, UseAnchoredPopoverOptions } from './types.js'

export function useAnchoredPopover(options: UseAnchoredPopoverOptions) {
  const id = `klc-popover-${useId()}`
  const anchorName = `--${id.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const native = supportsPopover()
  const anchored = native && supportsAnchorPositioning()
  const open = ref(false)
  const lifecycle = usePopoverLifecycle(options, open, native, id)
  const position = usePopoverPosition(options, open, native, anchored, anchorName, () =>
    lifecycle.hide({ restoreFocus: true }),
  )

  const triggerBindings = computed(() => ({
    ...lifecycle.triggerAttributes,
    'aria-expanded': open.value,
    'aria-controls': id,
    style: position.triggerStyle.value,
  }))
  const panelBindings = computed(() => ({
    ...lifecycle.panelAttributes,
    id,
    style: position.panelStyle.value,
  }))

  return {
    id,
    open: readonly(open),
    native,
    anchored,
    show: lifecycle.show,
    hide: lifecycle.hide,
    toggle: lifecycle.toggle,
    onTriggerClick: lifecycle.onTriggerClick,
    triggerBindings,
    panelBindings,
  }
}
