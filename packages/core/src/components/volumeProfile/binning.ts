/**
 * Bar-to-bucket volume distribution.
 *
 * Two modes, both described in `docs/ROADMAP.md` §3.1:
 *
 * - `typical-price` (fast, default): the bar's entire volume is added to the
 *   bucket containing the typical price `(high + low + close) / 3`. O(1) per
 *   bar. Good enough for live profiles and the case where each bar is small
 *   relative to the bucket size.
 *
 * - `proportional` (accurate): the bar's volume is split across every bucket
 *   that overlaps `[low, high]`, weighted by that bucket's price-range
 *   overlap with the bar. O(spanned buckets) per bar. Use this when bars
 *   span many buckets (e.g. higher timeframes, wide ranges).
 *
 * Both modes mutate the `buckets` array in place — the function is called in
 * a tight loop and we want zero allocations on the hot path. The controller
 * is responsible for zeroing the buckets before the first call.
 *
 * Out-of-range handling:
 *   - In `typical-price` mode a bar whose typical price falls outside
 *     `[binMin, binMin + binCount*binSize)` is **dropped silently**. The
 *     controller is responsible for sizing the price range so this only
 *     happens for accidentally bad inputs (e.g. zero-volume bars in a
 *     degenerate range).
 *   - In `proportional` mode the overlap with `[binMin, binMax]` is the
 *     effective contribution; a bar fully outside contributes nothing, a bar
 *     partially overlapping contributes proportionally.
 */

import type { BinningMode, VolumeProfileBar } from './types.js'

/**
 * Distribute one bar's volume into `buckets`.
 *
 * Preconditions (not checked, hot path):
 *   - `buckets.length === binCount`
 *   - `binSize > 0`
 *   - `binCount >= 1`
 *
 * @param bar       The OHLC bar (only `high`/`low`/`close`/`volume` are read).
 * @param buckets   Histogram array — written in place.
 * @param binMin    Low edge of bucket 0.
 * @param binSize   Price width of one bucket.
 * @param binCount  Number of buckets (must equal `buckets.length`).
 * @param mode      `typical-price` (fast) or `proportional` (accurate).
 *
 * @internal — building block used by the corresponding controller
 *   factory. Reachable today via the top-level `@klinechart-quant/core`
 *   barrel but **NOT part of the supported public API**. typedoc / api-
 *   extractor hide it from generated docs. Prefer the controller
 *   factory (e.g. `createVolumeProfileController`) for stable user code.
 *   Closes API audit BLOCKER-002 (export * leakage taxonomy).
 */
export function binBarToBuckets(
  bar: VolumeProfileBar,
  buckets: Float64Array,
  binMin: number,
  binSize: number,
  binCount: number,
  mode: BinningMode,
): void {
  if (bar.volume === 0 || binCount === 0 || binSize <= 0) return

  if (mode === 'typical-price') {
    const tp = (bar.high + bar.low + bar.close) / 3
    const idx = Math.floor((tp - binMin) / binSize)
    if (idx < 0 || idx >= binCount) return
    buckets[idx] = (buckets[idx] ?? 0) + bar.volume
    return
  }

  // Proportional mode — split the bar's volume across [low, high] by
  // per-bucket overlap with the bar's range.
  //
  // The bar's price extent is [low, high]; the buckets cover the price
  // axis at [binMin + i*binSize, binMin + (i+1)*binSize). We compute the
  // overlap of each touched bucket with [low, high] and weight by it.
  //
  // Degenerate-range bars (high === low, e.g. a doji at exactly one
  // tick) fall back to the typical-price behaviour — putting the volume
  // in the bucket containing `low` is the correct limit as
  // `high - low -> 0`.
  const binMax = binMin + binCount * binSize
  const barLow = bar.low
  const barHigh = bar.high

  // Drop bars fully outside the configured price range — they can't
  // contribute to any bucket.
  if (barHigh < binMin || barLow >= binMax) return

  if (barHigh === barLow) {
    const idx = Math.floor((barLow - binMin) / binSize)
    if (idx < 0 || idx >= binCount) return
    buckets[idx] = (buckets[idx] ?? 0) + bar.volume
    return
  }

  // Clamp the bar's range to the bucket grid so overlap math doesn't
  // include the out-of-range portion.
  const lo = barLow < binMin ? binMin : barLow
  const hi = barHigh > binMax ? binMax : barHigh

  const firstIdx = Math.floor((lo - binMin) / binSize)
  // For `hi` we use ceiling-of-(hi - binMin)/binSize, minus 1, so the
  // top boundary `hi === binMin + k*binSize` belongs to bucket k-1
  // (consistent with the half-open bucket convention `[lo, hi)`).
  let lastIdx = Math.ceil((hi - binMin) / binSize) - 1
  if (lastIdx < firstIdx) lastIdx = firstIdx

  // Effective span used as the denominator. We weight against the
  // *clamped* span (the part actually inside the bucket grid) so a bar
  // that hangs off the bottom doesn't get "phantom" volume into the
  // visible buckets. Trade-off: this means a bar partially outside
  // contributes only its inside-range fraction. This matches the
  // intuition of "what fraction of the bar's range fell into the
  // profile window".
  const span = hi - lo
  if (span <= 0) return

  const volPerUnit = bar.volume / (barHigh - barLow)

  for (let i = firstIdx; i <= lastIdx; i++) {
    if (i < 0 || i >= binCount) continue
    const bucketLow = binMin + i * binSize
    const bucketHigh = bucketLow + binSize
    const overlapLow = lo > bucketLow ? lo : bucketLow
    const overlapHigh = hi < bucketHigh ? hi : bucketHigh
    const overlap = overlapHigh - overlapLow
    if (overlap <= 0) continue
    buckets[i] = (buckets[i] ?? 0) + overlap * volPerUnit
  }
}
