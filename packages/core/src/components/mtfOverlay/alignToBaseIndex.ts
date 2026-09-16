import { KLineChartError } from '../../errors.js'
/**
 * Forward-fill a higher-timeframe series onto the base bar index, with strict
 * no-lookahead semantics.
 *
 * The rule, restated:
 *   A higher-tf bar opens at `hbar.timestamp` and covers the half-open
 *   interval `[hbar.timestamp, hbar.timestamp + targetIntervalMs)`. The
 *   higher-tf value at that bar is available to every base bar whose
 *   timestamp falls inside that interval — and only those base bars.
 *
 * Forward fill is implicit: because higher-tf bars are contiguous in time
 * (within the input series), a base bar at time `t` reads the value of the
 * higher-tf bar whose half-open interval contains `t`. If no such bar exists
 * (i.e. `t` is before the first higher-tf bar's open), the output is `null`.
 *
 * Gap handling: if the higher-tf series has a hole (bar N+1's open is more
 * than `targetIntervalMs` after bar N's open), base bars in that hole get the
 * value of bar N. This matches the forward-fill intuition users have — once
 * a higher-tf value exists, it stays visible until the next bucket opens.
 *
 * Lookahead-bias test (spelled out so it survives regressions):
 *   - hbar opens at 09:00 with value 100, targetIntervalMs = 1h.
 *   - base bar at 09:00 → value 100 (open of the bucket).
 *   - base bar at 09:59 → value 100 (still inside the bucket).
 *   - base bar at 08:55 → null (before the bucket opens — using 100 here
 *     would be lookahead).
 *
 * Performance: O(B + H) using a synced two-pointer walk (both inputs are
 * sorted by timestamp). Callers typically have B ≫ H (many fine bars per
 * coarse bar), so we step through `baseBars` linearly while advancing the
 * higher-tf cursor whenever the next bucket opens at or before `t`.
 */

/**
 * @internal — building block used by `createMtfController`. Reachable today
 *   via the top-level `@klinechart-quant/core` barrel but **NOT
 *   part of the supported public API**. typedoc / api-extractor
 *   hide it from generated docs. Prefer the controller factory
 *   for stable user code. Closes API audit BLOCKER-002.
 */
export function alignToBaseIndex<TValue>(
  baseBars: ReadonlyArray<{ timestamp: number }>,
  higherTfBars: ReadonlyArray<{ timestamp: number }>,
  higherTfValues: ReadonlyArray<TValue>,
  targetIntervalMs: number,
): ReadonlyArray<TValue | null> {
  if (!Number.isFinite(targetIntervalMs) || targetIntervalMs <= 0) {
    throw new KLineChartError(
      'MTF_CONFIG_INVALID',
      'alignToBaseIndex: targetIntervalMs must be a positive finite number',
    )
  }
  if (higherTfBars.length !== higherTfValues.length) {
    throw new KLineChartError(
      'MTF_CONFIG_INVALID',
      `alignToBaseIndex: higherTfBars.length (${higherTfBars.length}) must ` +
        `equal higherTfValues.length (${higherTfValues.length})`,
    )
  }

  const B = baseBars.length
  const H = higherTfBars.length
  const out: (TValue | null)[] = new Array(B)

  if (B === 0) return out
  if (H === 0) {
    for (let i = 0; i < B; i++) out[i] = null
    return out
  }

  // Two-pointer walk. `h` is the index of the higher-tf bar that COULD
  // cover the current base bar — meaning `higherTfBars[h].timestamp <= t`.
  // We advance `h` greedily as base bars march forward.
  let h = -1 // -1 ≡ "no higher-tf bar has opened yet"

  for (let i = 0; i < B; i++) {
    const t = baseBars[i].timestamp

    // Advance `h` to the latest higher-tf bar whose open is ≤ t. This is
    // the "no lookahead" gate: a bar whose open > t is invisible to us.
    while (h + 1 < H && higherTfBars[h + 1].timestamp <= t) {
      h++
    }

    if (h < 0) {
      // No higher-tf bar has opened at or before t → leading null.
      out[i] = null
      continue
    }

    // We have a candidate bar `h`. Final check: is t still inside its
    // half-open interval? If `higherTfBars[h+1]` exists and its open is
    // ≤ t, the while loop above would have advanced — so we only need to
    // check the upper bound for the last bar, or in a gap.
    const bucketStart = higherTfBars[h].timestamp
    if (t < bucketStart + targetIntervalMs) {
      out[i] = higherTfValues[h]
    } else {
      // t falls into a gap after bar h's closed interval and before
      // the next bar opens (or after the end of the series). Forward
      // fill: keep bar h's value visible.
      out[i] = higherTfValues[h]
    }
  }

  return out
}
