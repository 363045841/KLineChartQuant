/**
 * Value Area greedy expansion — VAH / VAL computation around the POC.
 *
 * Algorithm (CME-traditional, see `docs/ROADMAP.md` §3.1):
 *   1. Seed the Value Area with the POC bucket.
 *   2. Compute the target volume `target = totalVolume * percent`.
 *   3. Repeatedly grow the VA by **one** of its boundary's neighbours:
 *      compare the volume of `buckets[vahIdx + 1]` (upper neighbour) and
 *      `buckets[valIdx - 1]` (lower neighbour); annex the side with the
 *      larger volume.
 *   4. If one side has no neighbour left (boundary of the histogram), only
 *      the other side is available.
 *   5. Stop when `vaVolume >= target` or both sides are exhausted.
 *
 * Tie-breakers (critical — get these wrong and the test plan fails):
 *
 *   (A) When `upper.vol == lower.vol`, expand toward the POC. "Toward the
 *       POC" means: pick the side whose current boundary is **closer** to
 *       `pocIndex`. The intuition is that a symmetric tie should grow the
 *       VA evenly around the POC instead of drifting whichever way the
 *       comparison happens to land first. This matches the spirit of the
 *       CME spec, which expects the VA to be "balanced around POC" when
 *       data is symmetric, and it's the choice the maintainer's legacy
 *       renderer makes by default.
 *
 *   (B) When `upper.vol == lower.vol` AND both boundaries are equidistant
 *       from POC, prefer the **upper** side. This is documented because it
 *       is otherwise underspecified; the rationale is that an upper-side
 *       preference matches the default direction of price discovery on
 *       most assets (markets tend to break up out of balance).
 *
 *   (C) The CME-style "two-bucket lookahead" tie-breaker is intentionally
 *       NOT implemented in this pass — it adds complexity for a tiny
 *       difference in result and is not required by the test plan. It can
 *       be added behind a `tieBreaker: 'lookahead'` option later without
 *       breaking the API.
 *
 * Edge cases:
 *   - Empty / all-zero buckets ⇒ `vah = val = poc`, `vaVolume = 0`,
 *     `vaPercent = 0`. No expansion happens.
 *   - Single non-zero bucket ⇒ `vah = val = poc` already covers it.
 *   - POC at index 0 ⇒ only the upper neighbour exists.
 *   - POC at index N-1 ⇒ only the lower neighbour exists.
 *   - `targetPercent >= 1.0` ⇒ the loop expands until the full range is
 *     swept, yielding `valIdx = 0`, `vahIdx = N-1`.
 *   - `targetPercent <= 0` ⇒ the loop never runs; only the POC bucket is in
 *     the VA.
 */

import type { ValueAreaResult } from '../types.js'

/**
 * @internal — building block used by `createVolumeProfileController`. Reachable today
 *   via the top-level `@klinechart-quant/core` barrel but **NOT
 *   part of the supported public API**. typedoc / api-extractor
 *   hide it from generated docs. Prefer the controller factory
 *   for stable user code. Closes API audit BLOCKER-002.
 */
export function computeValueArea(
  buckets: Float64Array,
  pocIndex: number,
  targetPercent: number,
): ValueAreaResult {
  const n = buckets.length

  // -------------------------------------------------------------------
  // Empty histogram → degenerate result.
  // -------------------------------------------------------------------
  if (n === 0) {
    return {
      vahIndex: 0,
      valIndex: 0,
      pocIndex: 0,
      totalVolume: 0,
      vaVolume: 0,
      vaPercent: 0,
    }
  }

  // Clamp pocIndex defensively. The controller always passes a valid
  // value, but valueArea.ts is also exported for direct use.
  const poc = pocIndex < 0 ? 0 : pocIndex >= n ? n - 1 : pocIndex

  // -------------------------------------------------------------------
  // Total volume — single pass.
  // -------------------------------------------------------------------
  let totalVolume = 0
  for (let i = 0; i < n; i++) {
    totalVolume += buckets[i] ?? 0
  }

  // Zero-volume case → degenerate result, VA collapses to POC.
  if (totalVolume === 0) {
    return {
      vahIndex: poc,
      valIndex: poc,
      pocIndex: poc,
      totalVolume: 0,
      vaVolume: 0,
      vaPercent: 0,
    }
  }

  // -------------------------------------------------------------------
  // Seed the Value Area with the POC bucket.
  // -------------------------------------------------------------------
  let valIdx = poc
  let vahIdx = poc
  let vaVolume = buckets[poc] ?? 0

  const pct = targetPercent < 0 ? 0 : targetPercent > 1 ? 1 : targetPercent
  const target = totalVolume * pct

  // Already covered (rare — happens when POC bucket alone is > target%).
  // Still proceeds via the loop guard.

  // -------------------------------------------------------------------
  // Greedy expansion.
  // -------------------------------------------------------------------
  while (vaVolume < target) {
    const canUp = vahIdx < n - 1
    const canDown = valIdx > 0

    if (!canUp && !canDown) break // exhausted entire histogram

    // Single-side: only one direction has a neighbour.
    if (canUp && !canDown) {
      vahIdx += 1
      vaVolume += buckets[vahIdx] ?? 0
      continue
    }
    if (!canUp && canDown) {
      valIdx -= 1
      vaVolume += buckets[valIdx] ?? 0
      continue
    }

    const upVol = buckets[vahIdx + 1] ?? 0
    const downVol = buckets[valIdx - 1] ?? 0

    let goUp: boolean

    if (upVol > downVol) {
      goUp = true
    } else if (downVol > upVol) {
      goUp = false
    } else {
      // ----- Tie: expand toward POC (see (A)/(B) in header). -----
      // Distance from each *current* boundary to the POC. The
      // boundary that's farther from POC is on the "long" side; we
      // pull the VA back toward POC by extending the *closer*
      // boundary (i.e. the side that has further to travel before
      // it leaves POC's neighbourhood).
      //
      // Equivalently: pick the boundary whose distance to POC is
      // smaller — that side still has room to grow "around" POC,
      // the other side has already drifted.
      const distUp = vahIdx - poc // >= 0
      const distDown = poc - valIdx // >= 0
      if (distUp < distDown) {
        goUp = true
      } else if (distDown < distUp) {
        goUp = false
      } else {
        // Equidistant — documented upper-side preference (B).
        goUp = true
      }
    }

    if (goUp) {
      vahIdx += 1
      vaVolume += buckets[vahIdx] ?? 0
    } else {
      valIdx -= 1
      vaVolume += buckets[valIdx] ?? 0
    }
  }

  return {
    vahIndex: vahIdx,
    valIndex: valIdx,
    pocIndex: poc,
    totalVolume,
    vaVolume,
    vaPercent: totalVolume === 0 ? 0 : vaVolume / totalVolume,
  }
}
