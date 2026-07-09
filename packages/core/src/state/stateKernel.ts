/**
 * StateKernel — composition root for the chart's centralized state.
 *
 * Design contract (enforced by TypeScript structural types):
 *
 * 1.  **SSOT** — every piece of state has exactly one writable signal.
 *     There is no second cache, shadow field, or manual sync path.
 *
 * 2.  **Computed derivation** — derived values live in `computed()`.
 *     Source signals change → computed re-evaluates automatically.
 *     Manual `syncXxx()` / `updateYyy()` methods are banned.
 *
 * 3.  **Read/Write boundary** — external consumers receive
 *     `ReadonlySignal<T>` (no `.set()`). Internal mutation goes
 *     through `WritableSignal<T>` accessible only inside Action methods.
 *     The TypeScript compiler blocks any attempt to `.set()` from a
 *     render or UI context.
 *
 * 4.  **Action-only mutation** — all state changes flow through
 *     semantic Action methods (`scrollTo`, `zoomTo`, etc.). Actions
 *     may batch, validate, or trigger side-effects in one place.
 *
 * Sub-state modules are built with `createSubState()` and composed
 * here. The kernel itself contains **no business logic** — it only
 * wires sub-states together and exposes their readonly views + actions.
 */

import type { ReadonlySignal } from '../reactivity/signal'

/**
 * Base shape every sub-state module provides:
 *  - `readonly`  → the public, read-only signal view
 *  - `actions`   → semantic mutation methods (internal `.set()` calls)
 *
 * `R` is the readonly signal bag; `A` is the action record.
 * Sub-state factories return this interface, the kernel composes them.
 */
export interface SubStateModule<
  R extends Record<string, ReadonlySignal<unknown>>,
  A extends Record<string, (...args: any[]) => void>,
> {
  readonly: R
  actions: A
}

/**
 * StateKernel holds references to sub-state modules and exposes their
 * readonly signals + actions in a single bag. Concrete kernels
 * (e.g. `ChartStateKernel`) declare which sub-states they compose.
 *
 * The base class provides no runtime behavior — it exists to document
 * the composition pattern and give consumers a stable import point.
 * Sub-classes wire concrete sub-states in their constructor.
 */
export abstract class StateKernel {
  /**
   * Readonly signals from all sub-states, merged into one bag.
   * Framework adapters (Vue / React / Angular) consume this directly.
   */
  abstract readonly signals: Record<string, ReadonlySignal<unknown>>

  /**
   * Action methods from all sub-states, merged into one bag.
   * These are the ONLY sanctioned state mutation paths.
   */
  abstract readonly actions: Record<string, (...args: any[]) => void>

  /**
   * Cleanup hook — dispose all sub-state effects / subscriptions.
   * Called when the chart is destroyed.
   */
  abstract dispose(): void
}