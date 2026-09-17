/**
 * Aggressor classification — three heuristics for tagging a print as
 * buyer-initiated ("buy", aggressor lifted the ASK) or seller-initiated
 * ("sell", aggressor hit the BID).
 *
 * Future hook: Bulk Volume Classification (BVC) by Easley/Lopez de Prado/O'Hara
 * 2012 is more robust in HFT-fragmented markets where the tick rule's serial
 * correlation assumptions break. BVC is planned as a v2 classifier under the
 * same `AggressorResult` interface.
 *
 * Each classifier exports the same `AggressorResult` shape so the controller
 * can compose them in a fallback chain (explicit → heuristic) without
 * branching on classifier identity.
 *
 * See `docs/ROADMAP.md` §3.3 for the rationale — order of preference is
 * always explicit > Lee-Ready > tick rule.
 */

import type { AggressorSide, Trade, TradeWithFlag } from './types.js'

/**
 * Output of every classifier.
 *
 * `side` is `'unknown'` only when there is genuinely no information to act
 * on (e.g. the first trade in a tick-rule sequence). The controller should
 * treat `'unknown'` as "drop this trade from the aggregate", NOT as a
 * silent default to 'buy' or 'sell'.
 *
 * `inferred=false` means the side came from an exchange flag (zero error).
 * `inferred=true` means it was estimated; downstream UI should mark such
 * bars as approximate.
 */
export type { AggressorSide, Trade, TradeWithFlag }
export interface AggressorResult {
  side: AggressorSide | 'unknown'
  inferred: boolean
}

// ---------------------------------------------------------------------------
// 1. Explicit (exchange-provided flag)
// ---------------------------------------------------------------------------

/**
 * Read Binance-style `isBuyerMaker`. When the buyer is the maker (passive),
 * the seller was the aggressor — so we report `'sell'`. When the buyer is
 * NOT the maker, the buyer was the aggressor — `'buy'`.
 *
 * Returns `null` (not an `AggressorResult`) when the flag is missing so the
 * caller can distinguish "no data" from "we classified it as unknown". This
 * lets the controller fall back to the configured heuristic only when truly
 * needed.
 */
export function classifyExplicit(trade: TradeWithFlag): AggressorResult | null {
  if (trade.isBuyerMaker === undefined) return null
  return {
    side: trade.isBuyerMaker ? 'sell' : 'buy',
    inferred: false,
  }
}

// ---------------------------------------------------------------------------
// 2. Tick rule
// ---------------------------------------------------------------------------

/**
 * State carried across consecutive trades for the tick rule. The classifier
 * MUTATES this in place — callers should keep one instance per stream
 * (per-symbol if multiplexing).
 */
export interface TickRuleState {
  prevPrice: number | null
  prevSide: AggressorSide | null
}

/**
 * Classic tick test (Lee & Ready 1991 §2):
 *
 *   price > prevPrice → 'buy'     (uptick)
 *   price < prevPrice → 'sell'    (downtick)
 *   price == prevPrice → repeats prevSide  (zero-tick)
 *   first trade (prevPrice null) → 'unknown'
 *
 * The state is MUTATED so subsequent calls inherit the running context.
 */
export function classifyTickRule(state: TickRuleState, trade: Trade): AggressorResult {
  const prev = state.prevPrice
  let side: AggressorSide | 'unknown'

  if (prev === null) {
    side = 'unknown'
  } else if (trade.price > prev) {
    side = 'buy'
  } else if (trade.price < prev) {
    side = 'sell'
  } else {
    // zero-tick: inherit previous decision; 'unknown' if no prior side.
    side = state.prevSide ?? 'unknown'
  }

  // Update running state. We commit a known side; we deliberately do NOT
  // overwrite `prevSide` with 'unknown', otherwise a single missing-price
  // trade would poison the carry-over for the rest of the stream.
  state.prevPrice = trade.price
  if (side === 'buy' || side === 'sell') state.prevSide = side

  return { side, inferred: true }
}

// ---------------------------------------------------------------------------
// 3. Lee-Ready (quote-rule with tick-rule tiebreak)
// ---------------------------------------------------------------------------

/**
 * Lee-Ready uses the same carry-over fields as the tick rule — the two
 * heuristics can share a single state record because Lee-Ready falls back
 * to the tick rule on a quote-mid hit.
 */
export interface LeeReadyState extends TickRuleState {}

/**
 * Lee-Ready (1991) quote test:
 *
 *   If bid and ask are both finite:
 *     mid = (bid + ask) / 2
 *     price > mid → 'buy'
 *     price < mid → 'sell'
 *     price == mid → tick-rule fallback (zero spread or mid-cross)
 *   Else (bid/ask missing or non-finite) → tick-rule fallback.
 *
 * The state MUTATES exactly like `classifyTickRule` — when the quote test
 * resolves, we still update `prevPrice`/`prevSide` so a subsequent
 * tick-rule fallback has the latest context.
 */
export function classifyLeeReady(
  state: LeeReadyState,
  trade: Trade,
  bid: number,
  ask: number,
): AggressorResult {
  const quotesUsable = Number.isFinite(bid) && Number.isFinite(ask)

  if (!quotesUsable) {
    return classifyTickRule(state, trade)
  }

  const mid = (bid + ask) / 2

  if (trade.price > mid) {
    state.prevPrice = trade.price
    state.prevSide = 'buy'
    return { side: 'buy', inferred: true }
  }
  if (trade.price < mid) {
    state.prevPrice = trade.price
    state.prevSide = 'sell'
    return { side: 'sell', inferred: true }
  }
  // price == mid → fall back to tick rule (which updates state).
  return classifyTickRule(state, trade)
}
