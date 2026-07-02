/**
 * Pure math: anchored VWAP + volume-weighted standard-deviation bands.
 *
 * Used by `createAnchoredVwapController` for the from-scratch path
 * (`setBars`, `addAnchor`, `updateAnchor` when `barIndex` changes). The
 * controller's incremental `appendBar` reuses the same formulas via
 * running sums; the controller's tests pin equivalence between the two
 * paths.
 *
 * Math summary (formal derivation in `docs/ROADMAP.md` §3):
 *
 *   typicalPrice(j) = (H[j] + L[j] + C[j]) / 3
 *   vwp(j)          = typicalPrice(j) * V[j]
 *   sumVwp(i)       = Σ_{j=a..i} vwp(j)
 *   sumVol(i)       = Σ_{j=a..i} V[j]
 *   AVWAP(i)        = sumVwp(i) / sumVol(i)               (when sumVol > 0)
 *
 *   ─── important subtlety ─────────────────────────────────────────────────
 *   The standard-deviation bands MUST use the **prevailing** AVWAP(j) at
 *   each bar j ∈ [a..i], NOT the final AVWAP(i). Naive implementations that
 *   reuse the final mean understate the deviation early in the anchor and
 *   overstate it late — the bands wind up visibly off-centre on long
 *   anchors. The dedicated test
 *   `computeAnchoredVwap.test.ts → "bands use prevailing AVWAP at j"` pins
 *   this and would catch a regression to the wrong formula.
 *
 *   sqDev(j)        = (typicalPrice(j) - AVWAP(j))^2 * V[j]
 *   sumSqDev(i)     = Σ_{j=a..i} sqDev(j)
 *   variance(i)     = sumSqDev(i) / sumVol(i)
 *   stdDev(i)       = sqrt(variance(i))
 *   upper1(i)       = AVWAP(i) + stdDev(i)
 *   lower1(i)       = AVWAP(i) - stdDev(i)
 *   upper2(i)       = AVWAP(i) + 2 * stdDev(i)
 *   lower2(i)       = AVWAP(i) - 2 * stdDev(i)
 *
 * Zero-volume handling:
 *   - A bar with `volume === 0` contributes 0 to numerator, 0 to
 *     denominator, and 0 to the squared-deviation sum. The cumulative
 *     volume is unchanged.
 *   - If the cumulative volume is still > 0 at this bar (i.e. there was a
 *     prior non-zero bar) the AVWAP and bands **carry forward** the prior
 *     values — they are still mathematically well-defined.
 *   - If the cumulative volume is 0 (i.e. the anchor bar itself has
 *     volume 0 and every subsequent bar so far has volume 0 too), the
 *     point's `vwap` and band fields are `NaN`. The series still has an
 *     entry for the bar — `barIndex` and `cumulativeVolume` are filled in.
 */

import { KLineChartError } from '../../errors'

import type { AVWAPBar, AVWAPPoint } from './types'

/**
 * Compute the Anchored VWAP series for `bars`, anchored at
 * `anchorIndex` (inclusive). Returns one `AVWAPPoint` per bar from
 * `bars[anchorIndex]` through `bars[bars.length - 1]`.
 *
 * @param bars         the bar series; the anchor must lie inside it
 * @param anchorIndex  0-based index of the anchor bar (must satisfy
 *                     `0 <= anchorIndex < bars.length`)
 * @param includeBands when `false`, the four band fields equal `vwap` and
 *                     the (cheaper) one-pass cumulative-volume math is
 *                     used. The second pass that drives the bands is
 *                     skipped entirely.
 *
 * @throws RangeError when `anchorIndex` is out of range and `bars` is
 *                    non-empty. An empty `bars` array returns `[]` even
 *                    if `anchorIndex` would otherwise be invalid — this
 *                    mirrors the "no data, no work" convention used by
 *                    the volume-profile controller.
 *
 * @internal — building block used by the corresponding controller
 *   factory. Reachable today via the top-level `@klinechart-quant/core`
 *   barrel but **NOT part of the supported public API**. typedoc / api-
 *   extractor hide it from generated docs. Prefer the controller
 *   factory (e.g. `createVolumeProfileController`) for stable user code.
 *   Closes API audit BLOCKER-002 (export * leakage taxonomy).
 */
export function computeAnchoredVwap(
  bars: ReadonlyArray<AVWAPBar>,
  anchorIndex: number,
  includeBands: boolean,
): ReadonlyArray<AVWAPPoint> {
  if (bars.length === 0) return []

  if (anchorIndex < 0 || anchorIndex >= bars.length) {
    throw new KLineChartError(
      'AVWAP_ANCHOR_OUT_OF_RANGE',
      `anchoredVwap: anchorIndex ${anchorIndex} is out of range ` +
        `for bars of length ${bars.length}`,
    )
  }

  const out: AVWAPPoint[] = []

  // Running sums, advanced bar-by-bar.
  let sumVwp = 0
  let sumVol = 0
  let sumSqDev = 0

  // `prevVwap` carries forward when a bar has zero volume but the
  // cumulative volume so far is > 0. Initial value `NaN` flags the
  // "anchor bar volume 0" case (see the docstring).
  let prevVwap = Number.NaN

  for (let i = anchorIndex; i < bars.length; i++) {
    const bar = bars[i]
    // Guard against sparse arrays / undefined entries. `Float64Array`
    // would never have this hole, but plain arrays might.
    if (bar === undefined) continue

    const tp = (bar.high + bar.low + bar.close) / 3
    const v = bar.volume

    // First update cumulative volume + vwp. A v === 0 bar is a no-op
    // here and the running totals stay where they were.
    if (v > 0) {
      sumVwp += tp * v
      sumVol += v
    }

    let vwap: number
    if (sumVol > 0) {
      vwap = sumVwp / sumVol
      prevVwap = vwap
    } else {
      // No volume ever ingested — emit NaN. This only happens when
      // the anchor bar and every bar since it has v === 0.
      vwap = Number.NaN
    }

    // Bands: the *prevailing* AVWAP at bar j is the mean used to weigh
    // sqDev. That's exactly the `vwap` we just computed. Important:
    // if v === 0 the squared-deviation contribution is also 0, so we
    // can skip the term entirely (which also avoids touching `tp`
    // when `vwap` is NaN).
    if (includeBands && v > 0 && Number.isFinite(vwap)) {
      const diff = tp - vwap
      sumSqDev += diff * diff * v
    }

    let upper1 = vwap
    let lower1 = vwap
    let upper2 = vwap
    let lower2 = vwap
    if (includeBands && sumVol > 0 && Number.isFinite(vwap)) {
      const variance = sumSqDev / sumVol
      // Numerical safety: variance can be a tiny negative on
      // catastrophic cancellation. Treat as 0.
      const stdDev = Math.sqrt(variance > 0 ? variance : 0)
      upper1 = vwap + stdDev
      lower1 = vwap - stdDev
      upper2 = vwap + 2 * stdDev
      lower2 = vwap - 2 * stdDev
    }

    out.push({
      barIndex: i,
      vwap,
      upper1,
      lower1,
      upper2,
      lower2,
      cumulativeVolume: sumVol,
    })

    // `prevVwap` is kept up to date for documentation/clarity even
    // though we don't currently read it (the `sumVol > 0` branch above
    // assigns directly). Left in place to make the carry-forward
    // semantics explicit to future readers.
    void prevVwap
  }

  return out
}
