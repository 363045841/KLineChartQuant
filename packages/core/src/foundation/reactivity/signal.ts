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

/**
 * Read-only signal — the public face of all derived state.
 *
 * Consumers (renderers, UI bindings, framework adapters) receive
 * `ReadonlySignal<T>` and can read / subscribe but **cannot write**.
 * The TypeScript compiler blocks `.set()` calls on this type, enforcing
 * the StateKernel invariant that state changes flow through Actions only.
 *
 * `WritableSignal<T>` extends this shape with `set()`, so any function
 * accepting a `ReadonlySignal` also accepts a writable one — but the
 * reverse is structurally forbidden.
 */
export type ReadonlySignal<T> = {
  /** read current value; tracked when called inside `effect` */
  (): T
  /** read without tracking */
  peek: () => T
  /** subscribe; returns unsubscribe */
  subscribe: (listener: () => void) => () => void
}

/**
 * Writable signal — internal to StateKernel sub-states only.
 *
 * The `.set()` method is the single mutation entry point. Declaring a
 * field `private` and exposing it as `ReadonlySignal<T>` to the outside
 * creates a compile-time boundary between producers (Actions) and
 * consumers (renderers / UI).
 */
export type WritableSignal<T> = ReadonlySignal<T> & {
  /** write new value; notifies subscribers if `Object.is` differs */
  set: (next: T) => void
}

/**
 * Alias kept for backward compatibility.
 * `Signal<T>` is equivalent to `WritableSignal<T>` — the full read/write
 * shape that `createSignal` returns. Existing imports continue to work.
 */
export type Signal<T> = WritableSignal<T>

/**
 * Alias kept for backward compatibility.
 * `Computed<T>` is equivalent to `ReadonlySignal<T>` — the read-only
 * shape that `computed()` returns.
 */
export type Computed<T> = ReadonlySignal<T>

/**
 * A writable ref: the kernel-internal handle for a piece of state.
 * Identical to `WritableSignal<T>` — the name mirrors Vue's
 * `shallowRef` / `writableRef` convention so the migration reads
 * naturally in sub-state definitions.
 */
export type WritableRef<T> = WritableSignal<T>

/**
 * Alias for the read-only side of a writable ref — what gets exposed
 * to external consumers. Same shape as `ReadonlySignal<T>`.
 */
export type ReadonlyRef<T> = ReadonlySignal<T>

type Tracker = {
  deps: Set<Set<() => void>>
  run: () => void
}

let activeTracker: Tracker | null = null

let batchDepth = 0
const pendingBatch = new Set<() => void>()

/**
 * Create a writable signal (alias: `writableRef`).
 *
 * Returns a `WritableSignal<T>` — internally mutable, externally
 * downgrade-able to `ReadonlySignal<T>` by a simple assignment or
 * return-type annotation.
 */
export function createSignal<T>(initial: T): WritableSignal<T> {
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

  return Object.assign(read, { peek, set, subscribe }) as WritableSignal<T>
}

/**
 * Alias for `createSignal` — mirrors Vue's `writableRef` convention.
 * Use in kernel sub-state definitions: `private scrollLeft = writableRef(0)`.
 */
export const writableRef = createSignal

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

/**
 * Create a derived (read-only) signal.
 *
 * `computed<T>(fn)` runs `fn` once immediately, then re-runs whenever any
 * signal read inside `fn` changes. The returned `ReadonlySignal<T>` has no
 * `.set()` method — callers cannot write back into it, enforcing the
 * one-way data flow: source signals ⇢ computed ⇢ consumers.
 */
export function computed<T>(fn: () => T): ReadonlySignal<T> {
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
  return Object.assign(read, { peek: inner.peek, subscribe: inner.subscribe }) as ReadonlySignal<T>
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
  const signals = {} as { [K in keyof T]: WritableSignal<T[K]> }
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

/**
 * StateKernel sub-state factory.
 *
 * Creates a group of writable signals from `initial`, then exposes:
 *  - `signals`   — private writable handles (`.set()` available)
 *  - `readonly`  — the SAME signals, typed as `ReadonlySignal<T>` (no `.set()`)
 *  - `computed`  — derived signals registered via the `computed` option
 *
 * Sub-state modules call this factory, store `signals` privately, and
 * return `readonly` + actions to the kernel. The TypeScript boundary
 * between `WritableSignal` and `ReadonlySignal` prevents external
 * consumers from writing while keeping internal mutation ergonomic.
 *
 * @example
 * ```ts
 * function createViewportState() {
 *   const { signals, readonly, computed } = createSubState(
 *     { scrollLeft: 0, viewWidth: 0 },
 *     {
 *       scrollLeftLogical: (s) => s.scrollLeft() - s.viewWidth(),
 *     },
 *   )
 *   return {
 *     readonly,
 *     actions: {
 *       scrollTo: (v: number) => signals.scrollLeft.set(Math.max(0, v)),
 *     },
 *   }
 * }
 * ```
 */
export function createSubState<
  T extends Record<string, unknown>,
  C extends Record<string, unknown>,
>(
  initial: T,
  computedFns?: {
    [K in keyof C]: (state: { [K2 in keyof T]: ReadonlySignal<T[K2]> }) => C[K]
  },
) {
  const signals = {} as { [K in keyof T]: WritableSignal<T[K]> }
  const readonly = {} as { [K in keyof T]: ReadonlySignal<T[K]> }
  for (const key of Object.keys(initial) as (keyof T)[]) {
    const sig = createSignal<T[typeof key]>(initial[key])
    signals[key] = sig
    // structurally the same object, typed upcast to read-only
    readonly[key] = sig as ReadonlySignal<T[typeof key]>
  }

  const computedReadonly = {} as Record<string, ReadonlySignal<unknown>>
  if (computedFns) {
    for (const key of Object.keys(computedFns) as string[]) {
      const fn = (computedFns as Record<string, (state: typeof readonly) => unknown>)[key]!
      computedReadonly[key] = computed(() => fn(readonly))
    }
  }

  return {
    /** private writable handles — pass these to actions only */
    signals,
    /** read-only view — safe to expose to external consumers */
    readonly: { ...readonly, ...computedReadonly } as {
      [K in keyof T]: ReadonlySignal<T[K]>
    } & { [K in keyof C]: ReadonlySignal<C[K]> },
    /** writable-to-readonly snapshot (peeks all source signals) */
    snapshot: () => {
      const s: Record<string, unknown> = {}
      for (const k of Object.keys(initial) as (keyof T)[]) s[k as string] = signals[k].peek()
      return s as T
    },
  }
}
