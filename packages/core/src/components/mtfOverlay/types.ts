/**
 * Public types for the Multi-Timeframe (MTF) overlay module.
 *
 * Naming: "base" = the chart's primary timeframe (e.g. 5m), "higher tf" =
 * the resampled timeframe an MTF series lives on (e.g. 1h). The module never
 * downscales — you can only lift values from a coarser tf onto a finer one.
 *
 * Time semantics:
 *   - Every `timestamp` is in milliseconds since the Unix epoch.
 *   - A base bar's `timestamp` is the OPEN of that bar's interval (aligned
 *     to `baseIntervalMs` boundary, implicitly).
 *   - A resampled (higher-tf) bar's `timestamp` is the OPEN of its bucket,
 *     computed as `floor(firstBaseBar.timestamp / targetIntervalMs) * targetIntervalMs`.
 *   - A higher-tf bar's interval is `[timestamp, timestamp + targetIntervalMs)`.
 *
 * The MTF controller does NOT bring its own indicator math. The caller
 * supplies a `compute` function that takes resampled bars and returns one
 * number per resampled bar. Any indicator (EMA, RSI, custom) can be lifted
 * to MTF by writing such a compute fn.
 */

import type { Signal } from '../../foundation/reactivity/index'

/**
 * One bar of the BASE timeframe (the chart's primary candle stream).
 *
 * `timestamp` is the bar's OPEN, expected to be aligned to `baseIntervalMs`.
 * The module does not enforce alignment — it trusts the caller's stream.
 */
export interface BaseBar {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/**
 * A bar produced by aggregating `[sourceStart, sourceEnd]` (inclusive
 * indices into the input base-bar array) up to a higher timeframe.
 *
 * `sourceEnd === sourceStart` is allowed (single-base-bar bucket) — see
 * the "partial last bucket" semantics in `resampleBars`.
 */
export interface ResampledBar extends BaseBar {
  /** First base-bar index aggregated into this bucket (inclusive). */
  sourceStart: number
  /** Last base-bar index aggregated into this bucket (inclusive). */
  sourceEnd: number
}

/**
 * Definition of one MTF series. The controller owns the resampling and the
 * alignment; the caller owns the indicator math (`compute`).
 */
export interface MtfSeriesDefinition {
  /** Stable user-facing identifier. Re-using an existing id is rejected. */
  id: string
  /** Display label, e.g. `"EMA(20) 1h"`. The controller never reads this. */
  label: string
  /** Higher-tf bucket size in ms. Must be a positive multiple of base tf. */
  targetIntervalMs: number
  /**
   * Pure function: resampled bars → per-bar value array of the same length.
   * Called once per `setBaseBars`, `addSeries`, `updateSeries`, and once per
   * `appendBaseBar`. MUST NOT mutate the input.
   */
  compute: (resampledBars: ReadonlyArray<ResampledBar>) => ReadonlyArray<number>
}

/**
 * One active MTF series in the controller's snapshot.
 *
 * `alignedValues.length === baseBars.length` always holds after any state
 * transition. Leading entries are `null` for base bars that fall before the
 * first higher-tf bucket opens.
 */
export interface ActiveMtfSeries {
  definition: MtfSeriesDefinition
  /**
   * Forward-filled values aligned to the base bar index. Same length as the
   * controller's base-bar buffer. `null` only where no higher-tf bar covers
   * the base bar's timestamp (i.e. before the first bucket opens).
   */
  alignedValues: ReadonlyArray<number | null>
}

/**
 * Reactive MTF controller. The `series` signal updates synchronously on every
 * state-mutating call (`setBaseBars`, `addSeries`, `removeSeries`,
 * `updateSeries`, `appendBaseBar`). After `dispose()`, mutation calls become
 * no-ops and the signal stops firing.
 */
export interface MtfController {
  /** Current snapshot of every series with aligned values. */
  readonly series: Signal<ReadonlyArray<ActiveMtfSeries>>

  /**
   * Replace the base bar buffer in one shot and recompute every series —
   * canonical method, aligned with the cross-controller `setData()`
   * convention (AnchoredVwapController). Closes API audit BLOCKER-001.
   * `baseIntervalMs` must evenly divide every series' `targetIntervalMs`.
   */
  setData(bars: ReadonlyArray<BaseBar>, baseIntervalMs: number): void

  /**
   * @deprecated since 0.1.0-alpha.1 — use {@link MtfController.setData}.
   * Preserved as a non-removing alias for at least 6 months.
   */
  setBaseBars(bars: ReadonlyArray<BaseBar>, baseIntervalMs: number): void

  /**
   * Register a new series. Returns the series id.
   * Throws if `def.id` is already in use or `targetIntervalMs` is not a
   * positive multiple of the current `baseIntervalMs` (when bars are set).
   */
  addSeries(def: MtfSeriesDefinition): string

  /** Remove a series by id. Returns true if removed, false if not found. */
  removeSeries(id: string): boolean

  /**
   * Patch a series in place. Returns true if found.
   * Re-runs `compute` whenever `targetIntervalMs` or `compute` changes.
   */
  updateSeries(id: string, patch: Partial<Omit<MtfSeriesDefinition, 'id'>>): boolean

  /**
   * Append one base bar at the tail — canonical method, aligned with the
   * cross-controller `append()` convention (AnchoredVwapController).
   * Triggers a single per-series compute over the updated resampled
   * bars — NOT a from-scratch recompute over the whole base buffer.
   */
  append(bar: BaseBar): void

  /**
   * @deprecated since 0.1.0-alpha.1 — use {@link MtfController.append}.
   * Preserved as a non-removing alias for at least 6 months.
   */
  appendBaseBar(bar: BaseBar): void

  /** Tear down. After this, all mutators are no-ops; the signal stops. */
  dispose(): void
}
