/**
 * FootprintController — framework-agnostic, signal-based.
 *
 * Streams trades in, materialises a `FootprintBar[]` out. Composes:
 *
 *   - `classifyExplicit`  (try exchange flag first)
 *   - `classifyTickRule` / `classifyLeeReady` (fallback per config)
 *   - `computeDelta`, `computeDiagonalImbalances`, `computeCumulativeDelta`
 *
 * Internal storage is hot-path-friendly:
 *
 *   buckets: Map<barIndex, Map<priceTickKey, { askVol, bidVol }>>
 *
 * Materialisation (sorting + array build) is deferred to `bars` / `cumulativeDelta`
 * signal reads. A `dirty` flag invalidates the cache on every `ingestTrade`.
 *
 * Classifier state carry-over: the `TickRuleState` / `LeeReadyState` records
 * are MAINTAINED ACROSS BAR BOUNDARIES — i.e. the last trade's price/side of
 * bar N is used as the prior for the first trade of bar N+1. This is the
 * documented choice (see ROADMAP §3.3): per-bar reset would flag every bar's
 * first trade as `unknown`, which inflates dropped volume and breaks the
 * Lee-Ready zero-tick fallback at every minute boundary. The tested behaviour
 * relies on this carry-over.
 *
 * Dispose-guard pattern mirrors `createIndicatorSelectorController.ts`.
 */

import { KLineChartError } from '../../errors'
import { createSignal, type Signal } from '../../reactivity'

import {
  classifyExplicit,
  classifyLeeReady,
  classifyTickRule,
  type AggressorResult,
  type LeeReadyState,
  type TickRuleState,
} from './aggressor'
import { computeCumulativeDelta, computeDelta, computeDiagonalImbalances } from './perBarStats'
import type {
  FootprintBar,
  FootprintBarCell,
  FootprintConfig,
  FootprintController,
  FootprintImbalance,
  TradeWithFlag,
} from './types'

// ---------------------------------------------------------------------------
// Defaults & validation
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: FootprintConfig = {
  tickSize: 0.01,
  barIntervalMs: 60_000,
  imbalanceRatio: 3,
  fallbackClassifier: 'tick-rule',
}

function validateConfig(c: FootprintConfig): void {
  if (!(c.tickSize > 0)) {
    throw new KLineChartError(
      'FOOTPRINT_TICKSIZE_INVALID',
      'FootprintController: tickSize must be > 0',
    )
  }
  if (!(c.barIntervalMs > 0) || !Number.isFinite(c.barIntervalMs)) {
    throw new KLineChartError(
      'FOOTPRINT_BAR_INTERVAL_INVALID',
      'FootprintController: barIntervalMs must be > 0',
    )
  }
  if (!(c.imbalanceRatio > 0)) {
    throw new KLineChartError(
      'FOOTPRINT_RATIO_INVALID',
      'FootprintController: imbalanceRatio must be > 0',
    )
  }
}

// ---------------------------------------------------------------------------
// Internal cell shape (mutable counterpart of the readonly public cell)
// ---------------------------------------------------------------------------

interface MutableCell {
  askVol: number
  bidVol: number
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createFootprintController(init: Partial<FootprintConfig>): FootprintController {
  const initialConfig: FootprintConfig = { ...DEFAULT_CONFIG, ...init }
  validateConfig(initialConfig)

  const config: Signal<FootprintConfig> = createSignal(initialConfig)
  const bars: Signal<ReadonlyArray<FootprintBar>> = createSignal<ReadonlyArray<FootprintBar>>([])
  const cumulativeDelta: Signal<ReadonlyArray<number>> = createSignal<ReadonlyArray<number>>([])

  // ---- Internal state ------------------------------------------------

  /**
   * barIndex → (priceTickKey → mutable cell).
   *
   * We use Maps so insertion order is preserved per-bar (for debug-time
   * inspection); the public materialisation sorts deterministically.
   */
  let buckets: Map<number, Map<number, MutableCell>> = new Map()

  /**
   * Classifier carry-over. One record shared by tick rule and Lee-Ready —
   * they have the same field surface. NEVER reset on bar boundary
   * (see header comment).
   */
  const tickState: TickRuleState & LeeReadyState = {
    prevPrice: null,
    prevSide: null,
  }

  /** Set to true on every successful `ingestTrade`; cleared on materialise. */
  let dirty = false
  /** Disposal guard. */
  let disposed = false

  // ---- Helpers -------------------------------------------------------

  function classify(
    trade: TradeWithFlag,
    bid: number | undefined,
    ask: number | undefined,
  ): AggressorResult {
    // 1. Try the explicit exchange flag first (zero error).
    const explicit = classifyExplicit(trade)
    if (explicit !== null) {
      // Even when we don't consume the heuristic, advance the
      // carry-over so a later fallback-classified trade still has a
      // useful prevPrice/prevSide. We commit prevSide only for known
      // explicit sides.
      tickState.prevPrice = trade.price
      tickState.prevSide = explicit.side === 'unknown' ? null : explicit.side
      return explicit
    }
    // 2. Fall back to the configured heuristic.
    const mode = config.peek().fallbackClassifier
    if (mode === 'lee-ready') {
      // If quotes are missing, classifyLeeReady will degrade to the
      // tick rule itself — same state record.
      const b = bid ?? Number.NaN
      const a = ask ?? Number.NaN
      return classifyLeeReady(tickState, trade, b, a)
    }
    return classifyTickRule(tickState, trade)
  }

  function bucketFor(barIndex: number): Map<number, MutableCell> {
    let bar = buckets.get(barIndex)
    if (bar === undefined) {
      bar = new Map()
      buckets.set(barIndex, bar)
    }
    return bar
  }

  function cellFor(bar: Map<number, MutableCell>, priceTickKey: number): MutableCell {
    let cell = bar.get(priceTickKey)
    if (cell === undefined) {
      cell = { askVol: 0, bidVol: 0 }
      bar.set(priceTickKey, cell)
    }
    return cell
  }

  /**
   * Build the materialised view from `buckets`. Sorts bars ascending by
   * barIndex; within each bar, sorts cells ascending by price.
   */
  function materialise(): {
    bars: FootprintBar[]
    cumulative: number[]
  } {
    const cfg = config.peek()
    const sortedBarIndices = [...buckets.keys()].sort((a, b) => a - b)

    const outBars: FootprintBar[] = []
    const perBarDeltas: number[] = []

    for (const barIndex of sortedBarIndices) {
      const internal = buckets.get(barIndex)
      if (internal === undefined) continue

      const sortedKeys = [...internal.keys()].sort((a, b) => a - b)
      const cells: FootprintBarCell[] = sortedKeys.map((k) => {
        const c = internal.get(k) as MutableCell
        return {
          price: k * cfg.tickSize,
          askVol: c.askVol,
          bidVol: c.bidVol,
        }
      })

      const delta = computeDelta(cells)
      let totalVolume = 0
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i]
        if (cell === undefined) continue
        totalVolume += cell.askVol + cell.bidVol
      }

      const imbalances: ReadonlyArray<FootprintImbalance> = computeDiagonalImbalances(
        cells,
        cfg.imbalanceRatio,
      )

      const startTime = barIndex * cfg.barIntervalMs
      const endTime = startTime + cfg.barIntervalMs - 1

      outBars.push({
        barIndex,
        startTime,
        endTime,
        cells,
        delta,
        totalVolume,
        imbalances,
      })
      perBarDeltas.push(delta)
    }

    return { bars: outBars, cumulative: computeCumulativeDelta(perBarDeltas) }
  }

  function publishIfDirty(): void {
    if (!dirty) return
    const { bars: nextBars, cumulative } = materialise()
    bars.set(nextBars)
    cumulativeDelta.set(cumulative)
    dirty = false
  }

  // ---- Mutators ------------------------------------------------------

  function ingestTrade(trade: TradeWithFlag, bid?: number, ask?: number): void {
    if (disposed) return
    // Defensive: reject malformed trades. We do not throw — a single bad
    // print should not poison the live stream.
    if (!Number.isFinite(trade.price) || !Number.isFinite(trade.size)) {
      return
    }
    if (!Number.isFinite(trade.timestamp)) return
    if (trade.size <= 0) return

    const result = classify(trade, bid, ask)
    if (result.side === 'unknown') {
      // Drop from the aggregate (the documented contract). We've still
      // updated tickState inside `classify` so the next trade has
      // context.
      return
    }

    const cfg = config.peek()
    const barIndex = Math.floor(trade.timestamp / cfg.barIntervalMs)
    const priceTickKey = Math.round(trade.price / cfg.tickSize)

    const bar = bucketFor(barIndex)
    const cell = cellFor(bar, priceTickKey)
    if (result.side === 'buy') {
      cell.askVol += trade.size
    } else {
      cell.bidVol += trade.size
    }
    dirty = true
    publishIfDirty()
  }

  function setConfig(next: Partial<FootprintConfig>): void {
    if (disposed) return
    const cur = config.peek()
    const merged: FootprintConfig = { ...cur, ...next }
    validateConfig(merged)

    // Changing tickSize or barIntervalMs invalidates the buckets — the
    // priceTickKey and barIndex of every accumulated cell would be wrong
    // under the new partitioning. Clear them and let the caller re-feed
    // history if needed.
    const partitionChanged =
      merged.tickSize !== cur.tickSize || merged.barIntervalMs !== cur.barIntervalMs
    if (partitionChanged) {
      buckets = new Map()
      // We do NOT reset tickState — the next trade's carry-over is
      // still valid because the classifier only depends on price
      // history, not on the bucket partitioning.
    }
    config.set(merged)
    // Re-materialise. If partition changed, bars/cumulative now empty.
    // If only imbalanceRatio changed, we still want to re-flag.
    dirty = true
    publishIfDirty()
  }

  function reset(): void {
    if (disposed) return
    buckets = new Map()
    tickState.prevPrice = null
    tickState.prevSide = null
    bars.set([])
    cumulativeDelta.set([])
    dirty = false
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    // Mutators check `disposed` so no further writes will fire — existing
    // subscribers receive no further notifications.
  }

  return {
    config,
    bars,
    cumulativeDelta,
    // Canonical verb (API audit BLOCKER-001 harmonisation across
    // VolumeProfile / OrderBookHeatmap / Footprint). Wired to the same
    // implementation as `ingestTrade` so existing consumers keep working.
    ingest: ingestTrade,
    ingestTrade,
    setConfig,
    reset,
    dispose,
  }
}
