import type { ReadonlySignal } from '@363045841yyt/klinechart-core/reactivity'
import { computed, shallowRef, onScopeDispose, type ComputedRef } from 'vue'

/**
 * Bridge a core ReadonlySignal<T> into a read-only Vue ref backed by `shallowRef`.
 *
 * We use `shallowRef` (not `ref`) because:
 *   - core signal values are treated as immutable; deep proxying is wasteful
 *   - `Object.is` short-circuits in the core depend on referential equality,
 *     which Vue's deep reactivity would silently break
 *
 * Subscription is torn down via `onScopeDispose`, so this is safe to call
 * inside a Vue component setup, a composable, or a manually-created
 * `effectScope`. Calling it outside any scope still returns a working ref —
 * the caller is then responsible for unsubscribing.
 */
export function coreSignalToVueRef<T>(signal: ReadonlySignal<T>): ComputedRef<T> {
  const snapshot = shallowRef(signal.peek())
  const unsub = signal.subscribe(() => {
    snapshot.value = signal.peek()
  })
  onScopeDispose(unsub)
  return computed(() => snapshot.value)
}
