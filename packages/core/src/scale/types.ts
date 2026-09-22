/**
 * Coordinate-system contracts for the headless core.
 *
 * The `TimeScale` maps **bar index** (a discrete-but-fractional sequence number)
 * to a screen X position, per ROADMAP §1.1. Wall-clock time is a secondary
 * label, available only when a calendar is attached.
 *
 * The `PriceScale` maps a (possibly very narrow) price range to screen Y per
 * ROADMAP §1.2 — and additionally exposes an origin-shift policy so adapters
 * can keep GPU uploads in safe fp32 territory (ROADMAP §2.5).
 *
 * Both scales are **reactive**: their core state is exposed as signals so the
 * React/Vue/Angular adapter layer can subscribe without re-implementing the
 * change-detection plumbing.
 *
 * This file holds pure contracts only — the executable factories and the
 * anchored-zoom / origin-shift math live in `impl/`.
 */

import type { Signal } from '../foundation/reactivity/signal.js'

/** Linear (arithmetic) or logarithmic Y mapping. */
export type ScaleMode = 'linear' | 'log'

/**
 * Discrete bar-index ↔ screen X mapping (ROADMAP §1.1).
 *
 * Forward equation (the only equation a renderer needs to know):
 *
 *     x(i) = (i - firstVisibleIndex) * barWidth + leftPadding
 *
 * Inverse, used by anchored zoom and hit-testing:
 *
 *     i(x) = (x - leftPadding) / barWidth + firstVisibleIndex
 *
 * `firstVisibleIndex` is allowed to be **fractional, negative, or > N**;
 * this is what lets the user pan to "half a bar" or scroll into the future.
 */
export interface TimeScale {
  /** Inverse: screen X (logical px) → fractional bar index. */
  xToBarIndex(x: number): number
  /** Forward: fractional bar index → screen X (logical px). */
  barIndexToX(i: number): number

  /** Fractional, may be negative or > N. */
  readonly firstVisibleIndex: Signal<number>
  /** Logical pixels per bar. Clamped by the caller (e.g. zoom) not the scale. */
  readonly barWidth: Signal<number>
  /** Logical pixels added on the left edge before bar 0. */
  readonly leftPadding: Signal<number>

  setFirstVisibleIndex(i: number): void
  setBarWidth(w: number): void
  setLeftPadding(p: number): void

  /**
   * Attach (or detach with `null`) a wall-clock calendar so the scale can
   * answer `timeToBarIndex` / `barIndexToTime`. Bar indices not covered by
   * the calendar return `null` — *time is a label, not a coordinate*.
   */
  setCalendar(c: { barTimestamps: ReadonlyArray<number> } | null): void

  /** wall-clock ms → fractional bar index; `null` if no calendar / out of range. */
  timeToBarIndex(timestamp: number): number | null
  /** fractional bar index → wall-clock ms; `null` if no calendar / out of range. */
  barIndexToTime(i: number): number | null

  /** Detach signal subscribers and release any internal listeners. */
  dispose(): void
}

/**
 * Price → screen Y mapping (ROADMAP §1.2) plus an origin-shift policy
 * (ROADMAP §2.5) so adapters can upload fp32-safe values to the GPU.
 *
 * Coordinate convention: top-origin, Y increases downward (DOM standard).
 * A price ≥ `visibleMax` maps to y = 0, a price ≤ `visibleMin` maps to
 * y = `height`.
 */
export interface PriceScale {
  /** Forward: price → screen Y (top-origin, increases downward). */
  priceToY(p: number): number
  /** Inverse: screen Y → price. */
  yToPrice(y: number): number

  readonly mode: Signal<ScaleMode>
  readonly visibleMin: Signal<number>
  readonly visibleMax: Signal<number>
  readonly height: Signal<number>

  /** Set `'linear'` or `'log'`; throws on `'log'` if `visibleMin <= 0`. */
  setMode(mode: ScaleMode): void
  /** Update visible range. Triggers the origin-shift rebaseline check. */
  setVisibleRange(min: number, max: number): void
  setHeight(h: number): void

  /** Origin-shift reference; managed automatically but exposed for tests. */
  readonly originShiftRef: Signal<number>
  /** Returns `p - originShiftRef.peek()` — what to upload to the GPU as fp32. */
  toShiftedFp32(p: number): number

  dispose(): void
}

/**
 * Initialisation contract for `createTimeScale` (implementation in
 * `impl/createTimeScale.ts`).
 */
export interface TimeScaleConfig {
  /** Default firstVisibleIndex. Fractional/negative allowed. Default 0. */
  initialFirstVisibleIndex?: number
  /** Default barWidth in logical px. Must be > 0. Default 8. */
  initialBarWidth?: number
  /** Default leftPadding in logical px. Default 0. */
  initialLeftPadding?: number
}

/**
 * Initialisation contract for `createPriceScale` (implementation in
 * `impl/createPriceScale.ts`).
 */
export interface PriceScaleConfig {
  /** Initial mode. Default `'linear'`. */
  initialMode?: ScaleMode
  /** Initial visibleMin. Default 0. (Must be > 0 if initialMode === 'log'.) */
  initialVisibleMin?: number
  /** Initial visibleMax. Default 100. */
  initialVisibleMax?: number
  /** Initial canvas height in logical px. Default 480. */
  initialHeight?: number
  /**
   * Threshold for the origin-shift rebaseline policy. Default 0.01 (1% of
   * visible range). See `impl/originShift.ts` for the rationale.
   */
  originShiftThreshold?: number
}

/**
 * Input contract for `computeAnchoredZoom` (implementation in
 * `impl/anchoredZoom.ts`).
 */
export interface AnchoredZoomOptions {
  /** Screen X (logical px) where the wheel event fired. */
  mouseX: number
  /** Logical px on the left edge before bar 0. */
  leftPadding: number
  /** Current `firstVisibleIndex` (fractional). */
  firstVisibleIndex: number
  /** Current `barWidth` in logical px. */
  barWidth: number
  /** > 1 zoom in (wheel up), < 1 zoom out, === 1 no-op. */
  zoomFactor: number
  /** Lower clamp for the resulting bar width. Default 0.5 logical px. */
  minBarWidth?: number
  /** Upper clamp for the resulting bar width. Default 200 logical px. */
  maxBarWidth?: number
}

/** Output contract for `computeAnchoredZoom`. */
export interface AnchoredZoomResult {
  firstVisibleIndex: number
  barWidth: number
}

/**
 * Origin-shift policy contract (implementation in `impl/originShift.ts`).
 * Keeps GPU uploads in safe fp32 territory by subtracting a stable reference.
 */
export interface OriginShiftPolicy {
  /** Current reference value. Subtract this from any price before upload. */
  readonly ref: number
  /** Subtract `ref` from `value`. The fp32-safe number to upload. */
  shift(value: number): number
  /**
   * Maybe rebaseline. Returns `true` iff `ref` was updated.
   *
   * Policy: rebaseline only when
   *   `|currentMid - ref| / currentRange > threshold`.
   * On rebaseline, `ref` becomes `currentMid`.
   */
  maybeRebaseline(currentMid: number, currentRange: number): boolean
}
