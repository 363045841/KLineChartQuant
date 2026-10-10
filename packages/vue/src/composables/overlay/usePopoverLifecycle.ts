import { nextTick, onScopeDispose, type Ref, toValue, watch } from 'vue'
import { createFallbackLayer } from './fallbackLayers.js'
import type { UseAnchoredPopoverOptions } from './types.js'

interface DriverOptions {
  options: UseAnchoredPopoverOptions
  change(open: boolean): void
  ready(): void
}

function nativeDriver({ options, change, ready }: DriverOptions, id: string) {
  function onBeforeToggle(event: Event): void {
    if (event.target !== options.panel.value) return
    const opening = (event as Event & { newState: string }).newState === 'open'
    if (opening && toValue(options.disabled)) {
      event.preventDefault()
      return
    }
    change(opening)
  }

  function onToggle(event: Event): void {
    if (event.target !== options.panel.value) return
    if ((event as Event & { newState: string }).newState === 'open') ready()
  }

  return {
    trigger: { popovertarget: id },
    panel: { popover: 'auto' as const, onBeforetoggle: onBeforeToggle, onToggle },
    show() {
      try {
        options.panel.value?.showPopover()
      } catch {
        /* A disconnected panel cannot open. */
      }
    },
    hide(panel = options.panel.value) {
      try {
        panel?.hidePopover()
      } catch {
        /* The browser may already have closed it. */
      }
      change(false)
    },
  }
}

function fallbackDriver(
  { options, change, ready }: DriverOptions,
  close: (restoreFocus: boolean) => void,
) {
  const layer = createFallbackLayer({
    trigger: () => options.trigger.value,
    panel: () => options.panel.value,
    close,
  })
  return {
    trigger: {},
    panel: {},
    show() {
      layer.enter()
      change(true)
      ready()
    },
    hide(_panel?: HTMLElement | null) {
      layer.leave()
      change(false)
    },
  }
}

/** Open/close coordination is independent of the panel positioning strategy. */
export function usePopoverLifecycle(
  options: UseAnchoredPopoverOptions,
  open: Ref<boolean>,
  native: boolean,
  id: string,
) {
  let disposed = false
  let generation = 0
  let notified = false

  function change(next: boolean): void {
    if (open.value === next) return
    open.value = next
    generation++
    notified = false
    if (!next && !disposed) options.onClose?.()
  }

  function ready(): void {
    const opening = generation
    void nextTick(() => {
      if (disposed || !open.value || notified || generation !== opening) return
      notified = true
      options.onOpen?.()
    })
  }

  const callbacks = { options, change, ready }
  const driver = native
    ? nativeDriver(callbacks, id)
    : fallbackDriver(callbacks, (restoreFocus) => hide({ restoreFocus }))

  function show(): void {
    if (
      disposed ||
      open.value ||
      toValue(options.disabled) ||
      !options.panel.value ||
      !options.trigger.value
    )
      return
    driver.show()
  }

  function hide({ restoreFocus }: { restoreFocus?: boolean } = {}): void {
    if (!open.value) return
    const panel = options.panel.value
    const shouldRestore =
      restoreFocus ?? panel?.contains(panel.ownerDocument.activeElement) ?? false
    driver.hide()
    if (shouldRestore && !disposed) options.trigger.value?.focus()
  }

  function toggle(): void {
    if (open.value) hide()
    else show()
  }

  watch(
    () => toValue(options.disabled),
    (disabled) => {
      if (disabled) hide({ restoreFocus: false })
    },
    { flush: 'sync' },
  )

  watch(
    [options.trigger, options.panel],
    ([trigger, panel], [oldTrigger, oldPanel]) => {
      if (open.value && (trigger !== oldTrigger || panel !== oldPanel)) driver.hide(oldPanel)
    },
    { flush: 'sync' },
  )

  onScopeDispose(() => {
    disposed = true
    driver.hide()
  })

  return {
    show,
    hide,
    toggle,
    onTriggerClick: () => {
      if (!native) toggle()
    },
    triggerAttributes: driver.trigger,
    panelAttributes: driver.panel,
  }
}
