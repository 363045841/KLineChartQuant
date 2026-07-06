/**
 * Tiny push-based reactivity primitive. Zero dependencies.
 *
 * Design constraints:
 * - Synchronous notify on `set` when not batched (no microtask scheduling)
 * - `batch()` defers all notifications until the outermost batch exits
 * - No proxy / no deep tracking — only top-level read/write
 * - Equality short-circuits on `Object.is`
 * - `subscribe` returns an unsubscribe; safe to call from React useSyncExternalStore,
 *   Vue effect, Angular toSignal
 * - `effect` re-runs whenever any signal read inside re-emits
 */

export type Signal<T> = {
  /** read current value; tracked when called inside `effect` */
  (): T
  /** read without tracking */
  peek: () => T
  /** write new value; notifies subscribers if `Object.is` differs */
  set: (next: T) => void
  /** subscribe; returns unsubscribe */
  subscribe: (listener: () => void) => () => void
}

export type Computed<T> = {
  (): T
  peek: () => T
  subscribe: (listener: () => void) => () => void
}

type Tracker = {
  deps: Set<Set<() => void>>
  run: () => void
}

let activeTracker: Tracker | null = null

let batchDepth = 0
const pendingBatch = new Set<() => void>()

export function createSignal<T>(initial: T): Signal<T> {
  let value = initial
  const subscribers = new Set<() => void>()

  const read = (): T => {
    if (activeTracker !== null) {
      subscribers.add(activeTracker.run)
      activeTracker.deps.add(subscribers)
    }
    return value
  }

  const peek = (): T => value

  const set = (next: T): void => {
    if (Object.is(value, next)) return
    value = next
    if (batchDepth > 0) {
      for (const listener of subscribers) pendingBatch.add(listener)
    } else {
      // copy to allow listener self-unsubscribe during notify
      for (const listener of [...subscribers]) listener()
    }
  }

  const subscribe = (listener: () => void): (() => void) => {
    subscribers.add(listener)
    return () => {
      subscribers.delete(listener)
    }
  }

  return Object.assign(read, { peek, set, subscribe }) as Signal<T>
}

export function effect(fn: () => void): () => void {
  const tracker: Tracker = {
    deps: new Set(),
    run: () => {
      // tear down previous subscriptions before re-tracking
      for (const dep of tracker.deps) dep.delete(tracker.run)
      tracker.deps.clear()
      const prev = activeTracker
      activeTracker = tracker
      try {
        fn()
      } finally {
        activeTracker = prev
      }
    },
  }
  tracker.run()
  return () => {
    for (const dep of tracker.deps) dep.delete(tracker.run)
    tracker.deps.clear()
  }
}

export function computed<T>(fn: () => T): Computed<T> {
  const inner = createSignal<T>(undefined as unknown as T)
  let initialized = false
  effect(() => {
    const next = fn()
    if (!initialized) {
      initialized = true
      // bypass equality check on first run
      ;(inner as unknown as { set: (v: T) => void }).set(next)
      return
    }
    inner.set(next)
  })
  const read = (): T => inner()
  return Object.assign(read, { peek: inner.peek, subscribe: inner.subscribe }) as Computed<T>
}

/**
 * Batch multiple signal writes into a single notification cycle.
 *
 * Inside `batch(fn)`, all `Signal.set()` calls queue their subscribers
 * instead of notifying immediately. When the outermost batch exits,
 * every accumulated subscriber fires exactly once (deduplicated).
 *
 * Supports nesting — only the outermost batch triggers the flush.
 *
 * @example
 * ```ts
 * batch(() => {
 *   signalA.set(1)
 *   signalB.set('x')
 *   // subscribers haven't fired yet
 * })
 * // all subscribers fire once, deduped
 * ```
 */
export function batch<T>(fn: () => T): T {
  batchDepth++
  try {
    return fn()
  } finally {
    batchDepth--
    if (batchDepth === 0 && pendingBatch.size > 0) {
      const toNotify = [...pendingBatch]
      pendingBatch.clear()
      for (const listener of toNotify) listener()
    }
  }
}

/**
 * Create a group of related signals from an initial state object.
 * Returns typed { signals, set, snapshot } — eliminates `private _xxxSignal`
 * + `get xxx()` boilerplate in classes with many signals.
 *
 * Usage in a class field initializer:
 * ```ts
 * private state = createStateStore({ count: 0, name: '' })
 * // read:  state.signals.count()
 * // write: state.signals.count.set(5)
 * // bulk:  state.set.count(5); state.set.name('foo')
 * // snapshot: state.snapshot() // { count: 5, name: 'foo' }
 * ```
 */
export function createStateStore<T extends Record<string, unknown>>(initial: T) {
  const signals = {} as { [K in keyof T]: Signal<T[K]> }
  const set = {} as { [K in keyof T]: (v: T[K]) => void }
  for (const key of Object.keys(initial) as (keyof T)[]) {
    const sig = createSignal<T[typeof key]>(initial[key])
    signals[key] = sig
    set[key] = (v: T[typeof key]) => sig.set(v)
  }
  return {
    signals,
    set,
    snapshot: () => {
      const s: Record<string, unknown> = {}
      for (const k of Object.keys(initial) as (keyof T)[]) s[k as string] = signals[k].peek()
      return s as T
    },
  }
}
