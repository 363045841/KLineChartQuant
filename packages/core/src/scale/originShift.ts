import { KLineChartError } from '../errors.js'
/**
 * Origin-shift policy — ROADMAP §2.5, refined per the upstream PR feedback
 * about *rebaseline drift*.
 *
 * Background.  GPUs run fp32 (~7 decimal digits of precision). At BTC-tier
 * prices (~67,000) and tick sizes (~0.01) the absolute price burns most of
 * the mantissa, and a subtraction like `(p - pMin)` inside a zoomed-in
 * sub-dollar range produces catastrophic cancellation. The cheap fix is to
 * subtract a "reference value" `ref` on the CPU (which is fp64 and can spare
 * it) before uploading, so the GPU only ever sees relative deltas in the
 * 0.1-or-so range.
 *
 * Why this is its own policy object, and why **threshold-based**:
 *
 *   The naive implementation — "every frame, set `ref = midpoint of current
 *   visible range`" — looks right but is actively harmful on pan. Every time
 *   the user drags one logical pixel, `ref` changes by one logical-pixel-of-
 *   price, and *all* prices get re-quantized to a slightly different fp32
 *   rounding. The result is a continuous, sub-pixel **shimmer** of the entire
 *   chart that the eye perceives as soft jitter even when no actual data has
 *   changed. (This is the bug I flagged on the upstream PR.)
 *
 *   The fix is to keep `ref` *stable* until the visible-range center has
 *   drifted far enough that the fp32 budget is at risk of being exhausted —
 *   then rebaseline once, deliberately. The visible artifact becomes a single
 *   imperceptible discrete snap, instead of a continuous wobble.
 *
 *   In practice 1% of the visible range works well: at a 100-dollar range you
 *   tolerate `ref` being 1 dollar off-center before re-snapping, which is
 *   nowhere near the fp32 cliff but cuts rebaselines from "every frame" to
 *   a handful per pan gesture.
 *
 * Edge cases worth documenting:
 *
 *  - `threshold === 0` forces a rebaseline on *every* call where the midpoint
 *    differs from `ref` at all — this is the legacy "naive" behaviour, kept
 *    for parity tests against the bug we're avoiding.
 *
 *  - `threshold >= 1` effectively disables rebaselining, useful when an
 *    adapter wants to manage `ref` externally.
 *
 *  - A `currentRange` of zero (degenerate, visibleMin === visibleMax) is
 *    treated as "no signal" — we don't rebaseline because we cannot compute a
 *    meaningful normalized drift. The caller is responsible for handling the
 *    degenerate range elsewhere.
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

const DEFAULT_THRESHOLD = 0.01

/**
 * @internal — building block used by `createPriceScale`. Reachable today
 *   via the top-level `@klinechart-quant/core` barrel but **NOT
 *   part of the supported public API**. typedoc / api-extractor
 *   hide it from generated docs. Prefer the controller factory
 *   for stable user code. Closes API audit BLOCKER-002.
 */
export function createOriginShiftPolicy(
  initialRef: number,
  threshold: number = DEFAULT_THRESHOLD,
): OriginShiftPolicy {
  if (!Number.isFinite(initialRef)) {
    throw new KLineChartError(
      'INVALID_PARAM',
      `createOriginShiftPolicy: initialRef must be finite, got ${initialRef}`,
    )
  }
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new KLineChartError(
      'INVALID_PARAM',
      `createOriginShiftPolicy: threshold must be >= 0, got ${threshold}`,
    )
  }

  let ref = initialRef

  const policy: OriginShiftPolicy = {
    get ref() {
      return ref
    },
    shift(value: number): number {
      return value - ref
    },
    maybeRebaseline(currentMid: number, currentRange: number): boolean {
      // Degenerate range — refuse to rebaseline. Caller handles this elsewhere.
      if (!Number.isFinite(currentMid) || !Number.isFinite(currentRange) || currentRange <= 0) {
        return false
      }

      const drift = Math.abs(currentMid - ref)
      const normalized = drift / currentRange

      if (normalized > threshold) {
        ref = currentMid
        return true
      }
      return false
    },
  }

  return policy
}
