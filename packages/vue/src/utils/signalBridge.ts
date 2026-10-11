import type { ReadonlySignal } from '@363045841yyt/klinechart-core/reactivity'
import { type ComputedRef, computed, customRef, watch } from 'vue'

/** Minimal read-only source shared by Core signals and controller signals. */
export interface VueSignalSource<T> {
  peek(): T
  subscribe(listener: () => void): () => void
}

/**
 * Read Core on demand; subscriptions invalidate Vue without storing a business snapshot.
 * The source getter may depend on a controller ref. Switching it synchronously releases
 * the old subscription. The enclosing Vue scope owns the watcher and its cleanup.
 */
export function useSignalSource<T, TValue>(
  source: () => VueSignalSource<T> | undefined,
  project: (value: T) => TValue,
  fallback: () => TValue,
  filterChanges = false,
): ComputedRef<TValue> {
  const empty = computed(fallback)
  let current: VueSignalSource<T> | undefined
  const read = () => (current ? project(current.peek()) : empty.value)
  const reference = customRef<TValue>((track, trigger) => {
    watch(
      source,
      (signal, _previous, onCleanup) => {
        current = signal
        if (signal) {
          // Only field projections retain a comparison value to suppress unrelated updates.
          let previous = filterChanges ? read() : undefined
          onCleanup(
            signal.subscribe(() => {
              if (filterChanges) {
                const next = read()
                if (Object.is(previous, next)) return
                previous = next
              }
              trigger()
            }),
          )
        }
        trigger()
      },
      { immediate: true, flush: 'sync' },
    )
    return {
      get() {
        track()
        return read()
      },
      set() {
        /* Core remains the only writer. */
      },
    }
  })
  return computed(() => reference.value)
}

/** Scope-owned, read-only Vue access to a Core signal; values retain Core identity. */
export function coreSignalToVueRef<T>(signal: ReadonlySignal<T>): ComputedRef<T> {
  return useSignalSource(
    () => signal,
    (value) => value,
    () => signal.peek(),
  )
}
