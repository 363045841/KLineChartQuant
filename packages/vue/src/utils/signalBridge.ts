import { shallowRef, onScopeDispose, type Ref } from 'vue'
import type { Signal } from '@363045841yyt/klinechart-core/reactivity'

/**
 * Bridge a core Signal<T> into a Vue Ref<T> backed by `shallowRef`.
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
export function coreSignalToVueRef<T>(signal: Signal<T>): Ref<T> {
    const ref = shallowRef(signal.peek()) as Ref<T>
    const unsub = signal.subscribe(() => {
        ref.value = signal.peek()
    })
    onScopeDispose(unsub)
    return ref
}
