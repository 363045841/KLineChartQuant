/**
 * Anchored VWAP — public type contract.
 *
 * Anchored VWAP (AVWAP) is a volume-weighted average price calculation that
 * starts from a specific, user-chosen anchor bar rather than rolling over a
 * fixed window. Institutional traders anchor to earnings prints, swing
 * highs/lows, session opens, or macro events and read the resulting line as
 * a "fair price" reference from that moment forward. The ±1σ / ±2σ bands
 * around the AVWAP form a volume-weighted standard-deviation envelope that
 * is widely used for mean-reversion entries and exits.
 *
 * TradingView restricts the **number** of simultaneous AVWAP anchors on
 * lower tiers; this controller is multi-anchor by design — every anchor
 * tracks its own cumulative sums so incremental `appendBar` is O(1) per
 * anchor per bar.
 *
 * This module owns the **data model + math only**. Rendering belongs to the
 * `@klinechart-quant/core` Renderer/Scene layer (or a Vue/React adapter).
 *
 * See `docs/ROADMAP.md` §3 for the broader controller layering this fits
 * into. The dispose-guard pattern follows
 * `createIndicatorSelectorController.ts`.
 */

import type { Signal } from '../../foundation/reactivity/index'

/**
 * Minimum bar shape consumed by `computeAnchoredVwap`. Matches the
 * cross-renderer KLineData subset used elsewhere in core. We intentionally
 * do NOT require `open` or `timestamp` so callers can stream from any
 * source.
 */
export interface AVWAPBar {
  high: number
  low: number
  close: number
  volume: number
}

/**
 * A single point of an Anchored VWAP series — one entry per bar from the
 * anchor index (inclusive) through the end of the input.
 *
 * `barIndex` is the absolute bar index in the original input array (NOT a
 * series-relative offset). Renderers map it directly onto their X-axis.
 *
 * When bands are disabled (`includeBands: false`) the four band fields are
 * set equal to `vwap` so consumers do not need a `null` check.
 *
 * When a bar contributes no volume and there is no prior AVWAP (i.e. the
 * anchor bar itself has `volume === 0`), every numeric field of the
 * resulting point is `NaN`. See `computeAnchoredVwap.ts` for the
 * carry-forward rules.
 */
export interface AVWAPPoint {
  /** Absolute bar index in the input series. */
  barIndex: number
  /** Volume-weighted average price from anchor up to this bar. */
  vwap: number
  /** vwap + 1σ. Equals vwap when bands are disabled. */
  upper1: number
  /** vwap − 1σ. Equals vwap when bands are disabled. */
  lower1: number
  /** vwap + 2σ. Equals vwap when bands are disabled. */
  upper2: number
  /** vwap − 2σ. Equals vwap when bands are disabled. */
  lower2: number
  /** Running sum of volume from the anchor to this bar. Useful for
   *  diagnostics, exhaustion checks, and adapter overlays. */
  cumulativeVolume: number
}

/**
 * Definition of an anchor instance. Multiple anchors can be active at the
 * same time (e.g. one per session, one per earnings, one per swing low).
 *
 * `id` must be unique within the controller; the controller treats a
 * collision on `addAnchor` as a replace-in-place to keep the API
 * idempotent.
 */
export interface AnchorDefinition {
  /** Stable id. Caller-supplied; treat as opaque. */
  id: string
  /** Human-readable label (e.g. "Earnings Beat 2024-Q1"). */
  label: string
  /** Anchor position as an index into the controller's bar series. */
  barIndex: number
  /** Optional colour hint for the adapter — not used by the math. */
  color?: string
  /** Whether to compute the ±1σ / ±2σ bands for this anchor. */
  includeBands: boolean
}

/**
 * An anchor together with its computed AVWAP series. The series is a
 * snapshot — calling `setBars`, `appendBar`, or `updateAnchor` produces a
 * fresh array (immutability convention).
 */
export interface ActiveAnchor {
  definition: AnchorDefinition
  series: ReadonlyArray<AVWAPPoint>
}

/**
 * Framework-agnostic controller — mirrors the shape of
 * `VolumeProfileController` and `IndicatorSelectorController` (signals for
 * state, plain functions for mutations, idempotent `dispose`).
 *
 * Why this design:
 *  - Multi-anchor: every anchor tracks its own running sums so
 *    `appendBar` is O(anchors) per tick, not O(anchors × bars).
 *  - Signal-based: any adapter (React `useSyncExternalStore`, Vue effect,
 *    Angular `toSignal`) can bridge without coupling to a framework.
 *  - Dispose-guard: mutators become silent no-ops after `dispose`, so a
 *    component that unmounts mid-stream cannot leak updates into a stale
 *    listener.
 */
export interface AnchoredVwapController {
  /** All currently active anchors with their up-to-date series. */
  readonly anchors: Signal<ReadonlyArray<ActiveAnchor>>

  /**
   * Replace the underlying bar series and recompute every active anchor
   * from scratch — canonical method, aligned with the cross-controller
   * `setData()` convention (MtfController). Closes API audit BLOCKER-001
   * (5-verb intake proliferation).
   */
  setData(bars: ReadonlyArray<AVWAPBar>): void

  /**
   * @deprecated since 0.1.0-alpha.1 — use {@link AnchoredVwapController.setData}.
   * Preserved as a non-removing alias for at least 6 months.
   */
  setBars(bars: ReadonlyArray<AVWAPBar>): void

  /**
   * Add an anchor and compute its series immediately. Returns the
   * anchor's id (the same one passed in `def.id`). If an anchor with the
   * same id already exists it is **replaced** — that keeps the API
   * idempotent and matches what UIs expect when the user drags an anchor
   * onto an existing one.
   *
   * Returns `null` after dispose.
   */
  addAnchor(def: AnchorDefinition): string | null

  /**
   * Remove an anchor by id. Returns `true` when an anchor was actually
   * removed, `false` when the id was unknown (or after dispose).
   */
  removeAnchor(id: string): boolean

  /**
   * Patch an anchor in place. Any of `label`, `barIndex`, `color`, and
   * `includeBands` may change; the series is recomputed whenever
   * `barIndex` or `includeBands` changes (a pure label change is a
   * lightweight metadata swap).
   *
   * Returns `false` when the id is unknown (or after dispose).
   */
  updateAnchor(id: string, patch: Partial<Omit<AnchorDefinition, 'id'>>): boolean

  /**
   * Append a single new bar — canonical method, aligned with the
   * cross-controller `append()` convention (MtfController). Each anchor's
   * series is extended **incrementally** by one point — the running
   * cumulative sums make this O(1) per anchor per call. A full
   * `computeAnchoredVwap` after N appends produces the same result; see
   * the controller test that pins this equivalence.
   */
  append(bar: AVWAPBar): void

  /**
   * @deprecated since 0.1.0-alpha.1 — use {@link AnchoredVwapController.append}.
   * Preserved as a non-removing alias for at least 6 months.
   */
  appendBar(bar: AVWAPBar): void

  /**
   * Stop emitting. Subsequent mutator calls are silent no-ops; previously
   * attached subscribers receive no further notifications. Idempotent.
   */
  dispose(): void
}
