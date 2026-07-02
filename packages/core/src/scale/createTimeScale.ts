/**
 * TimeScale factory — discrete bar-index ↔ screen X mapping (ROADMAP §1.1).
 *
 * The math is one-line in each direction; the value of this factory is the
 * reactive plumbing (signals so adapters can subscribe) and the optional
 * wall-clock calendar that maps bar indices ↔ timestamps.
 *
 *     forward:  x(i) = (i - firstVisibleIndex) * barWidth + leftPadding
 *     inverse:  i(x) = (x - leftPadding) / barWidth + firstVisibleIndex
 *
 * Calendar semantics: when the user attaches a `barTimestamps` array, we treat
 * bar index `i` as the array index. Integer indices map directly; fractional
 * indices linearly interpolate between neighboring timestamps. Anything
 * outside `[0, N-1]` returns `null` — the caller decides whether to clamp,
 * extrapolate, or display a "—" label.
 */

import { KLineChartError } from '../errors'
import { createSignal } from '../reactivity/signal'

import type { TimeScale } from './types'

export interface TimeScaleConfig {
  /** Default firstVisibleIndex. Fractional/negative allowed. Default 0. */
  initialFirstVisibleIndex?: number
  /** Default barWidth in logical px. Must be > 0. Default 8. */
  initialBarWidth?: number
  /** Default leftPadding in logical px. Default 0. */
  initialLeftPadding?: number
}

export function createTimeScale(config: TimeScaleConfig = {}): TimeScale {
  const initialFirstVisibleIndex = config.initialFirstVisibleIndex ?? 0
  const initialBarWidth = config.initialBarWidth ?? 8
  const initialLeftPadding = config.initialLeftPadding ?? 0

  if (!(initialBarWidth > 0)) {
    throw new KLineChartError(
      'SCALE_BAR_WIDTH_INVALID',
      `createTimeScale: initialBarWidth must be > 0, got ${initialBarWidth}`,
    )
  }

  const firstVisibleIndex = createSignal(initialFirstVisibleIndex)
  const barWidth = createSignal(initialBarWidth)
  const leftPadding = createSignal(initialLeftPadding)

  let calendar: { barTimestamps: ReadonlyArray<number> } | null = null
  let disposed = false

  /**
   * Post-dispose: mutator calls become silent no-ops. This matches the
   * convention used by every other controller in @klinechart-quant/core
   * (IndicatorSelector, Toolbar, Drawing, Alerts, Replay, VolumeProfile,
   * Footprint, OrderBookHeatmap, AnchoredVwap, MtfOverlay). Throwing on
   * stale references — as the original implementation did — was the API
   * audit BLOCKER-004 (docs/audit/API_REVIEW.md) divergence; harmonized
   * to silent-no-op here.
   *
   * Returns `true` when the operation should proceed (controller live),
   * `false` when it should be skipped (post-dispose).
   */
  const guard = (): boolean => !disposed

  const scale: TimeScale = {
    firstVisibleIndex,
    barWidth,
    leftPadding,

    xToBarIndex(x: number): number {
      // We deliberately read with `.peek()` here — these methods are pure
      // queries, they must not register the caller as a reactive subscriber.
      const lp = leftPadding.peek()
      const bw = barWidth.peek()
      const fvi = firstVisibleIndex.peek()
      return (x - lp) / bw + fvi
    },

    barIndexToX(i: number): number {
      const lp = leftPadding.peek()
      const bw = barWidth.peek()
      const fvi = firstVisibleIndex.peek()
      return (i - fvi) * bw + lp
    },

    setFirstVisibleIndex(i: number): void {
      if (!guard()) return
      firstVisibleIndex.set(i)
    },

    setBarWidth(w: number): void {
      if (!guard()) return
      if (!(w > 0)) {
        throw new KLineChartError(
          'SCALE_BAR_WIDTH_INVALID',
          `TimeScale.setBarWidth: barWidth must be > 0, got ${w}`,
        )
      }
      barWidth.set(w)
    },

    setLeftPadding(p: number): void {
      if (!guard()) return
      leftPadding.set(p)
    },

    setCalendar(c) {
      if (!guard()) return
      calendar = c
    },

    timeToBarIndex(timestamp: number): number | null {
      if (calendar === null) return null
      const ts = calendar.barTimestamps
      const n = ts.length
      if (n === 0) return null
      // Binary search for the upper bound of `timestamp` in `ts`.
      // Returns the fractional index that interpolates linearly between
      // bracketing bars. Outside the calendar → null.
      if (timestamp < ts[0] || timestamp > ts[n - 1]) return null
      if (timestamp === ts[n - 1]) return n - 1
      let lo = 0
      let hi = n - 1
      while (hi - lo > 1) {
        const mid = (lo + hi) >>> 1
        if (ts[mid] <= timestamp) lo = mid
        else hi = mid
      }
      const span = ts[hi] - ts[lo]
      if (span <= 0) return lo
      return lo + (timestamp - ts[lo]) / span
    },

    barIndexToTime(i: number): number | null {
      if (calendar === null) return null
      const ts = calendar.barTimestamps
      const n = ts.length
      if (n === 0) return null
      if (i < 0 || i > n - 1) return null
      const lo = Math.floor(i)
      const hi = Math.min(lo + 1, n - 1)
      if (lo === hi) return ts[lo]
      const frac = i - lo
      return ts[lo] + (ts[hi] - ts[lo]) * frac
    },

    dispose(): void {
      // Signals don't allocate listeners we own; we just mark the
      // instance as dead so writes throw and tests can assert dispose
      // semantics. Reads remain functional as pure math.
      disposed = true
      calendar = null
    },
  }

  return scale
}
