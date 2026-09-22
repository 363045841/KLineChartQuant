/**
 * Per-bar derived statistics for the footprint data model.
 *
 *   - `computeDelta`             — Σ(askVol − bidVol) across a bar's cells
 *   - `computeCumulativeDelta`   — running sum of per-bar deltas
 *   - `computeDiagonalImbalances` — Bookmap/Sierra-style 3× diagonal flags
 *
 * These are the lightweight CPU-side helpers. The compute-shader path
 * (`computeShader.wgsl.md`) parallelises them per-bar in a single dispatch
 * for the heavy historical scan; the values produced here are byte-identical
 * to that GPU path's eventual output.
 *
 * See `docs/ROADMAP.md` §3.3 for the diagonal-imbalance rationale.
 */

import type { FootprintBarCell, FootprintImbalance } from '../types.js'

// ---------------------------------------------------------------------------
// Delta and cumulative delta
// ---------------------------------------------------------------------------

/**
 * Net buy-vs-sell volume for one bar. Positive values are buyer-dominated.
 *
 * Iterates the cells once; the order of cells does not affect the result.
 * An empty cell list yields 0 (the additive identity, sensible for a no-trade
 * bar so it does not break the running cumulative sum downstream).
 */
export function computeDelta(cells: ReadonlyArray<FootprintBarCell>): number {
  let sum = 0
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    if (c === undefined) continue
    sum += c.askVol - c.bidVol
  }
  return sum
}

/**
 * Running sum of per-bar deltas. `result[i] = Σ deltas[0..i]`.
 *
 * Empty input yields an empty array. We allocate a fresh array (not a typed
 * array) so consumers can splice/copy cheaply at the controller boundary.
 */
export function computeCumulativeDelta(perBarDeltas: ReadonlyArray<number>): number[] {
  const out: number[] = new Array(perBarDeltas.length)
  let running = 0
  for (let i = 0; i < perBarDeltas.length; i++) {
    running += perBarDeltas[i] ?? 0
    out[i] = running
  }
  return out
}

// ---------------------------------------------------------------------------
// Diagonal imbalance
// ---------------------------------------------------------------------------

/**
 * Diagonal imbalance detection.
 *
 *   Aggressive buyers eat the ASK at a price they cross — the ASK at price
 *   p is filled by buyers who were willing to pay p, and conversely, sellers
 *   who hit the BID at price p-1 (one tick below) were also "leaning"
 *   against that same level. So the right comparison is *diagonal*:
 *
 *     buy-imbalance at cell i:
 *       cell[i].askVol >= ratio * cell[i-1].bidVol  AND  cell[i-1].bidVol > 0
 *
 *     sell-imbalance at cell i:
 *       cell[i].bidVol >= ratio * cell[i+1].askVol  AND  cell[i+1].askVol > 0
 *
 * Edge handling: a buy-imbalance at i=0 has no `i-1` so it is never reported;
 * a sell-imbalance at the last index has no `i+1` so it is never reported.
 *
 * The `priceIndex` in the result is the index of the *dominant* cell — the
 * one carrying the heavy volume — not its diagonal counterpart.
 *
 * `ratio` is `dominant / weaker`, capped at `Number.POSITIVE_INFINITY` when
 * the weaker side is zero (caller can choose to render that as "∞").
 *
 * Default threshold: 3.0 (Bookmap / Sierra Chart convention). Pass any
 * positive ratio. A ratio of 1.0 would degenerate to "every diagonal pair
 * with non-zero asymmetry is an imbalance" — usually too noisy for display.
 *
 * @param cells           bar cells, ascending by price
 * @param ratioThreshold  minimum dominant/weaker ratio to flag
 */
export function computeDiagonalImbalances(
  cells: ReadonlyArray<FootprintBarCell>,
  ratioThreshold: number,
): ReadonlyArray<FootprintImbalance> {
  const out: FootprintImbalance[] = []
  const n = cells.length
  if (n === 0) return out

  for (let i = 0; i < n; i++) {
    const c = cells[i]
    if (c === undefined) continue

    // Buy imbalance: compare ask at i to bid at i-1 (the diagonal below).
    if (i > 0) {
      const below = cells[i - 1]
      if (below !== undefined && below.bidVol > 0) {
        const ratio = c.askVol / below.bidVol
        if (ratio >= ratioThreshold) {
          out.push({
            priceIndex: i,
            direction: 'buy-imbalance',
            ratio,
          })
        }
      }
    }

    // Sell imbalance: compare bid at i to ask at i+1 (the diagonal above).
    if (i < n - 1) {
      const above = cells[i + 1]
      if (above !== undefined && above.askVol > 0) {
        const ratio = c.bidVol / above.askVol
        if (ratio >= ratioThreshold) {
          out.push({
            priceIndex: i,
            direction: 'sell-imbalance',
            ratio,
          })
        }
      }
    }
  }

  return out
}
