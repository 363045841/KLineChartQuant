import type { MaybeRefOrGetter, Ref } from 'vue'

/** Explicit directions stay fixed; auto may flip to fit the viewport. */
export type AnchoredPlacement = 'auto' | 'top' | 'bottom'

export interface UseAnchoredPopoverOptions {
  trigger: Readonly<Ref<HTMLElement | null>>
  panel: Readonly<Ref<HTMLElement | null>>
  placement?: MaybeRefOrGetter<AnchoredPlacement>
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
