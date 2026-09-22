/**
 * Point of Control — argmax over the bucket histogram.
 *
 * The POC is the single bucket with the largest total volume. It is the seed
 * for the Value Area expansion (`valueArea.ts`) and the most-referenced level
 * on a volume profile chart.
 *
 * Tie-breaker policy (important — make sure it stays stable):
 *   When two or more buckets share the maximum, the **lowest index wins**.
 *
 * Rationale: argmax under ties is otherwise undefined, which leads to
 * non-deterministic state across runs and breaks snapshot tests. Returning
 * the lowest index is also the convention KLineCharts and the maintainer's
 * legacy renderer follow, so the visual placement of the POC line is
 * consistent across our data model and the existing renderer.
 *
 * Edge case: an empty array returns `-1`. Callers (the controller) treat
 * that as "no profile" and emit `state = null`. We pick -1 (not 0) so the
 * empty case is impossible to confuse with "argmax happens to be bucket 0".
 */

/**
 * Returns the index of the largest bucket. Ties resolve to the lowest index.
 * Returns -1 if `buckets.length === 0`.
 *
 * Single pass, branch-light, O(n).
 *
 * @internal — building block used by the corresponding controller
 *   factory. Reachable today via the top-level `@klinechart-quant/core`
 *   barrel but **NOT part of the supported public API**. typedoc / api-
 *   extractor hide it from generated docs. Prefer the controller
 *   factory (e.g. `createVolumeProfileController`) for stable user code.
 *   Closes API audit BLOCKER-002 (export * leakage taxonomy).
 */
export function findPOCIndex(buckets: Float64Array): number {
  const n = buckets.length
  if (n === 0) return -1

  let bestIdx = 0
  let bestVol = buckets[0] ?? 0

  // Walk buckets[1..]; strictly-greater wins, equal does NOT (keeps the
  // earliest index — the documented tie-breaker).
  for (let i = 1; i < n; i++) {
    const v = buckets[i] ?? 0
    if (v > bestVol) {
      bestVol = v
      bestIdx = i
    }
  }

  return bestIdx
}
