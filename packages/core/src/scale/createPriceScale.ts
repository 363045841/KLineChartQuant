/**
 * PriceScale factory — price ↔ screen Y (ROADMAP §1.2) + origin-shift policy
 * (ROADMAP §2.5).
 *
 * Linear mapping (top-origin, Y grows downward):
 *
 *     t        = (p        - visibleMin)        / (visibleMax - visibleMin)
 *     y        = height - t * height
 *     inverse: p = visibleMin + (1 - y / height) * (visibleMax - visibleMin)
 *
 * Log mapping (only valid for strictly positive ranges):
 *
 *     t        = (ln(p)    - ln(visibleMin))    / (ln(visibleMax) - ln(visibleMin))
 *     y        = height - t * height
 *     inverse: p = exp(ln(visibleMin) + (1 - y / height) * (ln(visibleMax) - ln(visibleMin)))
 *
 * Origin-shift policy: lives inside this scale and is consulted on every
 * `setVisibleRange`. It is intentionally in **linear-price space**, applied
 * *before* the log transform — that matches the existing engine and keeps the
 * "shift is just a translation" mental model clean. (Log-space shift is also
 * mathematically valid; it would compose better with sub-cent log-axis zoom on
 * astronomically high prices, but we have no such use case and this keeps
 * parity with the legacy renderer.)
 *
 * Degenerate range handling: when `visibleMin === visibleMax`, `priceToY` and
 * `yToPrice` would divide by zero. We pin the output to `height / 2` (the
 * geometric center) and document that the caller should treat this as
 * "everything at the same price"; this is preferred over throwing because
 * mid-frame `setVisibleRange(p, p)` is reachable from external data feeds and
 * we don't want one bad row to crash the chart.
 */

import { KLineChartError } from '../errors'
import { createSignal } from '../reactivity/signal'
import type { Signal } from '../reactivity/signal'

import { createOriginShiftPolicy, type OriginShiftPolicy } from './originShift'
import type { PriceScale, ScaleMode } from './types'

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
   * visible range). See `originShift.ts` for the rationale.
   */
  originShiftThreshold?: number
}

export function createPriceScale(config: PriceScaleConfig = {}): PriceScale {
  const initialMode: ScaleMode = config.initialMode ?? 'linear'
  const initialVisibleMin = config.initialVisibleMin ?? 0
  const initialVisibleMax = config.initialVisibleMax ?? 100
  const initialHeight = config.initialHeight ?? 480

  if (!(initialVisibleMax >= initialVisibleMin)) {
    throw new KLineChartError(
      'SCALE_RANGE_INVALID',
      `createPriceScale: initialVisibleMax (${initialVisibleMax}) must be >= initialVisibleMin (${initialVisibleMin})`,
    )
  }
  if (initialMode === 'log' && !(initialVisibleMin > 0)) {
    throw new KLineChartError(
      'SCALE_LOG_REQUIRES_POSITIVE',
      `createPriceScale: log mode requires visibleMin > 0, got ${initialVisibleMin}`,
    )
  }
  if (!(initialHeight > 0)) {
    throw new KLineChartError(
      'SCALE_HEIGHT_INVALID',
      `createPriceScale: initialHeight must be > 0, got ${initialHeight}`,
    )
  }

  const mode = createSignal<ScaleMode>(initialMode)
  const visibleMin = createSignal(initialVisibleMin)
  const visibleMax = createSignal(initialVisibleMax)
  const height = createSignal(initialHeight)

  const initialRef = (initialVisibleMin + initialVisibleMax) / 2
  const policy: OriginShiftPolicy = createOriginShiftPolicy(initialRef, config.originShiftThreshold)
  const originShiftRef = createSignal(policy.ref)

  let disposed = false
  /**
   * Post-dispose: mutator calls become silent no-ops. See createTimeScale.ts
   * for the rationale + API audit BLOCKER-004 reference. Returns `true` when
   * the operation should proceed.
   */
  const guard = (): boolean => !disposed

  /**
   * Run `policy.maybeRebaseline` with the latest visible range and, if it
   * rebased, mirror the new value into the reactive `originShiftRef` signal
   * so subscribers (uniform updaters, GPU buffer uploaders) can pick it up.
   */
  const syncOriginShift = (): void => {
    const min = visibleMin.peek()
    const max = visibleMax.peek()
    const range = max - min
    const mid = (min + max) / 2
    if (policy.maybeRebaseline(mid, range)) {
      originShiftRef.set(policy.ref)
    }
  }

  const priceToYLinear = (p: number): number => {
    const min = visibleMin.peek()
    const max = visibleMax.peek()
    const h = height.peek()
    const span = max - min
    if (span <= 0) return h / 2
    const t = (p - min) / span
    return h - t * h
  }

  const priceToYLog = (p: number): number => {
    const min = visibleMin.peek()
    const max = visibleMax.peek()
    const h = height.peek()
    // Defensive — setMode('log') already rejects bad ranges, but we keep
    // priceToY total so a stray p<=0 doesn't NaN out the whole chart.
    if (p <= 0 || min <= 0 || max <= 0 || max <= min) return h / 2
    const t = (Math.log(p) - Math.log(min)) / (Math.log(max) - Math.log(min))
    return h - t * h
  }

  const yToPriceLinear = (y: number): number => {
    const min = visibleMin.peek()
    const max = visibleMax.peek()
    const h = height.peek()
    const span = max - min
    if (span <= 0) return min
    return min + (1 - y / h) * span
  }

  const yToPriceLog = (y: number): number => {
    const min = visibleMin.peek()
    const max = visibleMax.peek()
    const h = height.peek()
    if (min <= 0 || max <= 0 || max <= min) return min
    const lmin = Math.log(min)
    const lmax = Math.log(max)
    const ly = lmin + (1 - y / h) * (lmax - lmin)
    return Math.exp(ly)
  }

  const scale: PriceScale = {
    mode,
    visibleMin,
    visibleMax,
    height,
    originShiftRef: originShiftRef as Signal<number>,

    priceToY(p: number): number {
      return mode.peek() === 'log' ? priceToYLog(p) : priceToYLinear(p)
    },

    yToPrice(y: number): number {
      return mode.peek() === 'log' ? yToPriceLog(y) : yToPriceLinear(y)
    },

    setMode(next: ScaleMode): void {
      if (!guard()) return
      if (next === 'log') {
        const min = visibleMin.peek()
        const max = visibleMax.peek()
        if (!(min > 0) || !(max > 0)) {
          throw new KLineChartError(
            'SCALE_LOG_REQUIRES_POSITIVE',
            `PriceScale.setMode('log'): requires visibleMin > 0 and visibleMax > 0, got min=${min}, max=${max}`,
          )
        }
      }
      mode.set(next)
    },

    setVisibleRange(min: number, max: number): void {
      if (!guard()) return
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        throw new KLineChartError(
          'SCALE_RANGE_INVALID',
          `PriceScale.setVisibleRange: both bounds must be finite, got min=${min}, max=${max}`,
        )
      }
      if (max < min) {
        throw new KLineChartError(
          'SCALE_RANGE_INVALID',
          `PriceScale.setVisibleRange: max (${max}) must be >= min (${min})`,
        )
      }
      if (mode.peek() === 'log' && !(min > 0)) {
        throw new KLineChartError(
          'SCALE_LOG_REQUIRES_POSITIVE',
          `PriceScale.setVisibleRange: log mode requires min > 0, got ${min}`,
        )
      }
      visibleMin.set(min)
      visibleMax.set(max)
      syncOriginShift()
    },

    setHeight(h: number): void {
      if (!guard()) return
      if (!(h > 0)) {
        throw new KLineChartError(
          'SCALE_HEIGHT_INVALID',
          `PriceScale.setHeight: height must be > 0, got ${h}`,
        )
      }
      height.set(h)
    },

    toShiftedFp32(p: number): number {
      return policy.shift(p)
    },

    dispose(): void {
      disposed = true
    },
  }

  return scale
}
