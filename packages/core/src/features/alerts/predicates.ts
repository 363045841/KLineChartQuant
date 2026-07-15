/**
 * Built-in predicate kit.
 *
 * Each predicate is a pure function over `(predicate, curr, prev)`:
 *   - `curr` is the snapshot at the current evaluation.
 *   - `prev` is the snapshot from the previous evaluation of the SAME rule
 *     (the controller threads it through). For cross-style predicates the
 *     prev value is what makes "just-crossed" detectable vs. "is above".
 *   - When `prev` is null (first evaluation), cross predicates must NOT fire —
 *     we cannot distinguish "already above" from "just crossed up" without a
 *     reference point.
 *
 * All predicates are O(1) — no scanning of history. The caller pre-computes
 * any rolling state (e.g. `rollingVolume[N]`).
 *
 * Defensive: predicates return `false` for any required field that is null,
 * undefined, or non-finite. We never throw — a bad snapshot must not crash
 * an entire alert pass.
 */

import type {
  AlertPredicate,
  CrossDirection,
  IndicatorCrossPairDirection,
  MarketSnapshot,
} from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}

/**
 * Generic numeric cross check.
 *   - up   : prev < threshold && curr >= threshold
 *   - down : prev > threshold && curr <= threshold
 *   - any  : either
 *
 * Returns false if either side is non-finite. The `>=` / `<=` on the curr side
 * is intentional — a value landing exactly on the threshold counts as a cross
 * the instant it arrives (matches trader intuition: "alert me when price hits
 * 100" should fire at 100, not require 100.01).
 */
function crossed(
  prevValue: number | null,
  currValue: number,
  threshold: number,
  direction: CrossDirection,
): boolean {
  if (prevValue === null || !isFiniteNumber(prevValue)) return false
  if (!isFiniteNumber(currValue) || !isFiniteNumber(threshold)) return false
  const up = prevValue < threshold && currValue >= threshold
  const down = prevValue > threshold && currValue <= threshold
  if (direction === 'up') return up
  if (direction === 'down') return down
  return up || down
}

/**
 * Cross of two series A vs B (indicator vs indicator). Direction:
 *   - a-above-b : A was <= B and is now > B (A crossed UP through B)
 *   - a-below-b : A was >= B and is now < B (A crossed DOWN through B)
 *   - any       : either
 *
 * Note the asymmetric strictness vs. `crossed`: here we use strict inequality
 * on the post side because equality of two floats is rare and ambiguous — we
 * wait for the next tick of separation.
 */
function crossedPair(
  prevA: number | null,
  prevB: number | null,
  currA: number,
  currB: number,
  direction: IndicatorCrossPairDirection,
): boolean {
  if (prevA === null || prevB === null) return false
  if (!isFiniteNumber(prevA) || !isFiniteNumber(prevB)) return false
  if (!isFiniteNumber(currA) || !isFiniteNumber(currB)) return false
  const aAboveB = prevA <= prevB && currA > currB
  const aBelowB = prevA >= prevB && currA < currB
  if (direction === 'a-above-b') return aAboveB
  if (direction === 'a-below-b') return aBelowB
  return aAboveB || aBelowB
}

// ---------------------------------------------------------------------------
// evaluatePredicate — the dispatch
// ---------------------------------------------------------------------------

/**
 * Returns `true` iff the predicate fires for this (prev, curr) pair.
 *
 * The controller wraps `kind: 'custom'` in its own try/catch — but we still
 * defensively guard against the function being missing here.
 */
export function evaluatePredicate(
  predicate: AlertPredicate,
  curr: MarketSnapshot,
  prev: MarketSnapshot | null,
): boolean {
  switch (predicate.kind) {
    case 'price-cross': {
      const cBar = curr.bar
      const pBar = prev?.bar ?? null
      if (cBar === null || !isFiniteNumber(cBar.close)) return false
      const prevClose = pBar !== null && isFiniteNumber(pBar.close) ? pBar.close : null
      return crossed(prevClose, cBar.close, predicate.price, predicate.direction)
    }

    case 'price-in-range': {
      const cBar = curr.bar
      if (cBar === null || !isFiniteNumber(cBar.close)) return false
      const { min, max } = predicate
      if (!isFiniteNumber(min) || !isFiniteNumber(max)) return false
      return cBar.close >= min && cBar.close <= max
    }

    case 'price-out-of-range': {
      const cBar = curr.bar
      if (cBar === null || !isFiniteNumber(cBar.close)) return false
      const { min, max } = predicate
      if (!isFiniteNumber(min) || !isFiniteNumber(max)) return false
      return cBar.close < min || cBar.close > max
    }

    case 'indicator-cross': {
      const id = predicate.indicatorId
      const cVal = curr.indicators[id]
      if (cVal === undefined || !isFiniteNumber(cVal)) return false
      const pRaw = prev?.indicators[id]
      const pVal = pRaw !== undefined && isFiniteNumber(pRaw) ? pRaw : null
      return crossed(pVal, cVal, predicate.threshold, predicate.direction)
    }

    case 'indicator-cross-indicator': {
      const { aId, bId, direction } = predicate
      const cA = curr.indicators[aId]
      const cB = curr.indicators[bId]
      if (cA === undefined || cB === undefined || !isFiniteNumber(cA) || !isFiniteNumber(cB)) {
        return false
      }
      const pARaw = prev?.indicators[aId]
      const pBRaw = prev?.indicators[bId]
      const pA = pARaw !== undefined && isFiniteNumber(pARaw) ? pARaw : null
      const pB = pBRaw !== undefined && isFiniteNumber(pBRaw) ? pBRaw : null
      return crossedPair(pA, pB, cA, cB, direction)
    }

    case 'volume-spike': {
      const cBar = curr.bar
      if (cBar === null || !isFiniteNumber(cBar.volume)) return false
      const avg = curr.rollingVolume[predicate.lookbackBars]
      // Missing avg or zero avg → no useful baseline; do not fire.
      if (avg === undefined || !isFiniteNumber(avg) || avg <= 0) return false
      if (!isFiniteNumber(predicate.multipleOfAvg)) return false
      return cBar.volume >= avg * predicate.multipleOfAvg
    }

    case 'volume-profile-poc-touch': {
      const cBar = curr.bar
      const vp = curr.volumeProfile
      if (cBar === null || !isFiniteNumber(cBar.close)) return false
      if (vp === undefined || !isFiniteNumber(vp.poc) || vp.poc === 0) return false
      if (!isFiniteNumber(predicate.bandPercent)) return false
      const distance = Math.abs(cBar.close - vp.poc) / Math.abs(vp.poc)
      return distance <= predicate.bandPercent
    }

    case 'order-book-wall': {
      const ob = curr.orderBook
      if (ob === undefined) return false
      const { sizeMultipleOfMedian: k } = predicate
      if (!isFiniteNumber(k)) return false
      const bidHit =
        isFiniteNumber(ob.medianBidSize) &&
        isFiniteNumber(ob.maxBidSize) &&
        ob.medianBidSize > 0 &&
        ob.maxBidSize >= ob.medianBidSize * k
      const askHit =
        isFiniteNumber(ob.medianAskSize) &&
        isFiniteNumber(ob.maxAskSize) &&
        ob.medianAskSize > 0 &&
        ob.maxAskSize >= ob.medianAskSize * k
      return bidHit || askHit
    }

    case 'footprint-imbalance': {
      const fp = curr.footprint
      if (fp === undefined) return false
      if (
        !isFiniteNumber(fp.latestBarMaxImbalanceRatio) ||
        !isFiniteNumber(fp.latestBarImbalanceCount)
      ) {
        return false
      }
      return (
        fp.latestBarMaxImbalanceRatio >= predicate.minImbalanceRatio &&
        fp.latestBarImbalanceCount >= predicate.consecutivePriceLevels
      )
    }

    case 'custom': {
      if (typeof predicate.evaluate !== 'function') return false
      // The controller also wraps this call in try/catch; the inner
      // guard here protects callers that invoke predicates directly
      // (e.g. tests or third-party tooling).
      try {
        return predicate.evaluate(curr) === true
      } catch {
        return false
      }
    }

    default: {
      // Exhaustiveness check — adding a new kind without a case here
      // will surface as a TS error on this line.
      const _exhaustive: never = predicate
      void _exhaustive
      return false
    }
  }
}
