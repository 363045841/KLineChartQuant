/**
 * Anchored VWAP controller — framework-agnostic, signal-based, multi-anchor.
 *
 * Mirrors the dispose-guard pattern from
 * `createIndicatorSelectorController` and `createVolumeProfileController` so
 * React/Vue/Angular adapters bridge identically. The controller is pure
 * data — no DOM, no rendering, no canvas.
 *
 * Why multi-anchor with per-anchor running sums:
 *   TradingView's lower tiers cap the number of simultaneous anchors at
 *   3 because each AVWAP is recomputed from scratch on every new bar. By
 *   keeping per-anchor `sumVwp` / `sumVol` / `sumSqDev` totals we drop
 *   `appendBar` from O(bars-since-anchor) to O(1) per anchor — anchors
 *   become cheap enough to keep many open at once.
 *
 * Equivalence guarantee:
 *   The point produced by `appendBar` is bit-for-bit identical (to
 *   floating-point precision) to the point that `computeAnchoredVwap`
 *   would produce on the same bar at the same anchor — same operands
 *   added in the same order. The controller test
 *   `appendBar incrementally matches full recompute` pins this.
 */

import { createSignal, type Signal } from '../../foundation/reactivity/index'

import { computeAnchoredVwap } from './computeAnchoredVwap'
import type {
  ActiveAnchor,
  AnchorDefinition,
  AnchoredVwapController,
  AVWAPBar,
  AVWAPPoint,
} from './types'

// ---------------------------------------------------------------------------
// Internal state per anchor
// ---------------------------------------------------------------------------

/**
 * Mutable per-anchor scratch. We keep this separate from `ActiveAnchor` so
 * the public signal value only exposes the immutable view (definition +
 * series) and consumers can rely on structural sharing where it matters.
 */
interface AnchorState {
  definition: AnchorDefinition
  // Running cumulative sums from the anchor up to and including the last
  // bar processed. These are what make `appendBar` O(1).
  sumVwp: number
  sumVol: number
  sumSqDev: number
  // The series produced so far. Each `appendBar` pushes one new point.
  // Held mutable internally; surfaced as ReadonlyArray.
  series: AVWAPPoint[]
}

export interface AnchoredVwapControllerInit {
  initialBars?: ReadonlyArray<AVWAPBar>
}

export function createAnchoredVwapController(
  opts?: AnchoredVwapControllerInit,
): AnchoredVwapController {
  // -------------------------------------------------------------------
  // Internal mutable state — never exposed directly.
  // -------------------------------------------------------------------
  // Defensive copy: the caller may reuse the array they pass us. We
  // capture a snapshot so `appendBar` can extend it without surprising
  // the caller.
  let bars: AVWAPBar[] = opts?.initialBars ? [...opts.initialBars] : []
  const anchorStates = new Map<string, AnchorState>()

  // -------------------------------------------------------------------
  // Public signal — re-emitted on every structural change.
  // -------------------------------------------------------------------
  const anchors: Signal<ReadonlyArray<ActiveAnchor>> = createSignal<ReadonlyArray<ActiveAnchor>>([])

  /**
   * Rebuild the public signal value from the current `anchorStates`. We
   * pass a fresh array reference each time so `Object.is` in
   * `signal.set` triggers a notify.
   */
  function publish(): void {
    const next: ActiveAnchor[] = []
    for (const a of anchorStates.values()) {
      next.push({
        definition: a.definition,
        // Snapshot the series so consumers see an immutable
        // view; future `appendBar` mutations on `a.series` will
        // only be observed by the next `publish`.
        series: [...a.series],
      })
    }
    anchors.set(next)
  }

  // -------------------------------------------------------------------
  // Math helpers — share one definition of the per-bar arithmetic so
  // `appendBar` and `recomputeAnchor` cannot drift.
  // -------------------------------------------------------------------

  /**
   * Recompute an anchor's series from scratch by walking the bars from
   * `definition.barIndex`. Also resets the running sums so subsequent
   * `appendBar` calls extend the same totals.
   *
   * `null` is a sentinel meaning "anchor is out of range for the
   * current bars" — the caller drops a point-free entry.
   */
  function recomputeAnchor(state: AnchorState): void {
    const def = state.definition
    // Out-of-range anchor: leave the running sums at zero and emit an
    // empty series. We deliberately do NOT throw — callers might be
    // mid-stream and an out-of-range anchor is a valid transient
    // state (e.g. user dragged the anchor past the loaded window).
    if (bars.length === 0 || def.barIndex < 0 || def.barIndex >= bars.length) {
      state.sumVwp = 0
      state.sumVol = 0
      state.sumSqDev = 0
      state.series = []
      return
    }

    // Use the shared pure function so behaviour stays identical.
    const series = computeAnchoredVwap(bars, def.barIndex, def.includeBands)
    // Reconstruct the running sums by replaying the same arithmetic
    // — we need them for the next `appendBar`. This is the only
    // place where the controller duplicates the math; the cost is
    // unavoidable because `computeAnchoredVwap` does not expose its
    // internal sums.
    let sumVwp = 0
    let sumVol = 0
    let sumSqDev = 0
    for (let i = def.barIndex; i < bars.length; i++) {
      const bar = bars[i]
      if (bar === undefined) continue
      const v = bar.volume
      if (v > 0) {
        const tp = (bar.high + bar.low + bar.close) / 3
        sumVwp += tp * v
        sumVol += v
        // Prevailing AVWAP at this bar — same operands as the
        // pure function, same addition order.
        if (def.includeBands && sumVol > 0) {
          const vwap = sumVwp / sumVol
          const diff = tp - vwap
          sumSqDev += diff * diff * v
        }
      }
    }
    state.sumVwp = sumVwp
    state.sumVol = sumVol
    state.sumSqDev = sumSqDev
    state.series = [...series]
  }

  /**
   * Extend an anchor's series by one bar incrementally — O(1) per call.
   * The new bar's absolute index in `bars` is the caller's
   * responsibility to compute; we take it as a parameter so
   * `appendBar` can be straight-line.
   */
  function extendAnchorByOne(state: AnchorState, bar: AVWAPBar, absIndex: number): void {
    const def = state.definition
    // Skip anchors that haven't started yet (anchor is in the future
    // relative to this new bar).
    if (absIndex < def.barIndex) return
    // Skip anchors with no anchor inside the loaded window.
    if (def.barIndex < 0) return

    const v = bar.volume
    const tp = (bar.high + bar.low + bar.close) / 3

    if (v > 0) {
      state.sumVwp += tp * v
      state.sumVol += v
    }

    let vwap = Number.NaN
    if (state.sumVol > 0) {
      vwap = state.sumVwp / state.sumVol
    }

    // Bands: prevailing AVWAP at this bar — same arithmetic as
    // `recomputeAnchor` and `computeAnchoredVwap`.
    if (def.includeBands && v > 0 && state.sumVol > 0 && Number.isFinite(vwap)) {
      const diff = tp - vwap
      state.sumSqDev += diff * diff * v
    }

    let upper1 = vwap
    let lower1 = vwap
    let upper2 = vwap
    let lower2 = vwap
    if (def.includeBands && state.sumVol > 0 && Number.isFinite(vwap)) {
      const variance = state.sumSqDev / state.sumVol
      const stdDev = Math.sqrt(variance > 0 ? variance : 0)
      upper1 = vwap + stdDev
      lower1 = vwap - stdDev
      upper2 = vwap + 2 * stdDev
      lower2 = vwap - 2 * stdDev
    }

    state.series.push({
      barIndex: absIndex,
      vwap,
      upper1,
      lower1,
      upper2,
      lower2,
      cumulativeVolume: state.sumVol,
    })
  }

  // -------------------------------------------------------------------
  // Lifecycle — kick off any initial anchors (none today, but reserved).
  // -------------------------------------------------------------------
  if (bars.length > 0) {
    // No anchors yet — publish empty so subscribers see a defined
    // starting value.
    publish()
  }

  // -------------------------------------------------------------------
  // Public mutators
  // -------------------------------------------------------------------

  function setBars(nextBars: ReadonlyArray<AVWAPBar>): void {
    bars = [...nextBars]
    for (const state of anchorStates.values()) {
      recomputeAnchor(state)
    }
    publish()
  }

  function addAnchor(def: AnchorDefinition): string | null {
    // Replace-in-place on id collision. The brief allows either
    // semantics; we choose replace because UIs that drag an anchor
    // onto an existing one expect the existing one to update, not
    // to throw.
    const state: AnchorState = {
      definition: { ...def },
      sumVwp: 0,
      sumVol: 0,
      sumSqDev: 0,
      series: [],
    }
    recomputeAnchor(state)
    anchorStates.set(def.id, state)
    publish()
    return def.id
  }

  function removeAnchor(id: string): boolean {
    const existed = anchorStates.delete(id)
    if (existed) publish()
    return existed
  }

  function updateAnchor(id: string, patch: Partial<Omit<AnchorDefinition, 'id'>>): boolean {
    const state = anchorStates.get(id)
    if (state === undefined) return false

    const prev = state.definition
    // Merge into a fresh definition object — never mutate the
    // existing one (immutability convention).
    const nextDef: AnchorDefinition = {
      ...prev,
      ...patch,
      id: prev.id,
    }
    state.definition = nextDef

    // Recompute only when the math-affecting fields change.
    const mathDirty =
      (patch.barIndex !== undefined && patch.barIndex !== prev.barIndex) ||
      (patch.includeBands !== undefined && patch.includeBands !== prev.includeBands)
    if (mathDirty) {
      recomputeAnchor(state)
    }
    publish()
    return true
  }

  function appendBar(bar: AVWAPBar): void {
    const absIndex = bars.length
    bars.push(bar)
    for (const state of anchorStates.values()) {
      extendAnchorByOne(state, bar, absIndex)
    }
    publish()
  }

  // -------------------------------------------------------------------
  // Dispose — silence mutators (same pattern as the rest of the codebase)
  // -------------------------------------------------------------------
  let disposed = false
  function dispose(): void {
    if (disposed) return
    disposed = true
  }

  function guard<T extends (...args: never[]) => unknown>(fn: T, fallback: ReturnType<T>): T {
    return ((...args: Parameters<T>): ReturnType<T> => {
      if (disposed) return fallback
      return fn(...args) as ReturnType<T>
    }) as T
  }

  const guardedSetBars = guard(setBars, undefined as void)
  const guardedAppendBar = guard(appendBar, undefined as void)

  return {
    anchors,
    // Canonical verbs (API audit BLOCKER-001 harmonisation): `setData`
    // for full replacement + `append` for single-item extension. Old
    // names preserved as aliases for the deprecation window.
    setData: guardedSetBars,
    append: guardedAppendBar,
    setBars: guardedSetBars,
    addAnchor: guard(addAnchor, null),
    removeAnchor: guard(removeAnchor, false),
    updateAnchor: guard(updateAnchor, false),
    appendBar: guardedAppendBar,
    dispose,
  }
}
