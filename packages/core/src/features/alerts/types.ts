/**
 * Alert rule engine — public types.
 *
 * Why we build our own (vs. relying on TradingView's alert engine):
 *   - TV alerts are closed, server-side, capped (60 free + paid tiers).
 *   - TV alerts are limited to TV's built-in indicator outputs.
 *   - We need to alert on differentiating signals TV simply cannot see —
 *     Volume Profile POC touch, Order Book wall appearance, Footprint
 *     imbalance hit. These predicates are first-class here.
 *
 * Engine shape:
 *   - Predicate-based (discriminated union, schema-driven).
 *   - Rules are pure data and serialisable (see `ruleSchema.ts`) so they
 *     survive page reloads and can be shared between users/agents/servers.
 *   - The controller is a tiny state machine over rules + recent events;
 *     evaluation is O(rules) per call, O(1) per rule, safe to run in a
 *     per-frame loop.
 *
 * The `custom` predicate is an escape hatch for callers that need ad-hoc
 * logic without forking the schema. It carries an in-memory function that
 * is intentionally NOT serialisable — see `ruleSchema.ts` for the reasoning.
 */

import type { Signal } from '../../foundation/reactivity/signal'

// ---------------------------------------------------------------------------
// MarketSnapshot — the read-only input fed into every predicate.
// ---------------------------------------------------------------------------

/**
 * A snapshot of "the chart right now" that all predicates evaluate against.
 *
 * Callers are expected to populate as much as they have. A predicate that
 * needs a sub-field absent from the snapshot must return `false` (no spurious
 * fires from missing data).
 */
export interface MarketSnapshot {
  /** Latest closed bar; `null` for an empty stream. */
  bar: {
    timestamp: number
    open: number
    high: number
    low: number
    close: number
    volume: number
  } | null
  /** Latest scalar value per indicator id (keyed by your indicator instance id). */
  indicators: Readonly<Record<string, number>>
  /**
   * Average volume across the last N bars, keyed by N. Required for the
   * `volume-spike` predicate to be O(1) — the caller maintains the rolling
   * mean elsewhere.
   */
  rollingVolume: Readonly<Record<number, number>>
  /** Optional advanced components (filled only when those components are mounted). */
  volumeProfile?: { poc: number; vah: number; val: number }
  orderBook?: {
    medianBidSize: number
    medianAskSize: number
    maxBidSize: number
    maxAskSize: number
  }
  footprint?: {
    latestBarMaxImbalanceRatio: number
    latestBarImbalanceCount: number
  }
}

// ---------------------------------------------------------------------------
// AlertPredicate — discriminated union of supported predicate kinds.
// ---------------------------------------------------------------------------

export type CrossDirection = 'up' | 'down' | 'any'
export type IndicatorCrossPairDirection = 'a-above-b' | 'a-below-b' | 'any'

/**
 * Predicate kinds. Add new kinds by extending the union — the controller's
 * switch in `predicates.ts` will give a TS exhaustiveness error if you forget
 * to handle it.
 */
export type AlertPredicate =
  | { kind: 'price-cross'; price: number; direction: CrossDirection }
  | { kind: 'price-in-range'; min: number; max: number }
  | { kind: 'price-out-of-range'; min: number; max: number }
  | {
      kind: 'indicator-cross'
      indicatorId: string
      threshold: number
      direction: CrossDirection
    }
  | {
      kind: 'indicator-cross-indicator'
      aId: string
      bId: string
      direction: IndicatorCrossPairDirection
    }
  | { kind: 'volume-spike'; multipleOfAvg: number; lookbackBars: number }
  | { kind: 'volume-profile-poc-touch'; bandPercent: number }
  | { kind: 'order-book-wall'; sizeMultipleOfMedian: number }
  | {
      kind: 'footprint-imbalance'
      minImbalanceRatio: number
      consecutivePriceLevels: number
    }
  /**
   * Escape hatch. The `evaluate` function runs INSIDE a try/catch in the
   * controller — a throwing custom predicate must not crash the alert pass.
   * Custom predicates CANNOT be serialised; see `ruleSchema.ts`.
   */
  | { kind: 'custom'; evaluate: (snapshot: MarketSnapshot) => boolean }

export type AlertPredicateKind = AlertPredicate['kind']

// ---------------------------------------------------------------------------
// AlertRule + AlertEvent
// ---------------------------------------------------------------------------

export interface AlertRule {
  id: string
  name: string
  predicate: AlertPredicate
  enabled: boolean
  /** Fire once and then auto-disable. */
  oneShot: boolean
  /**
   * For non-oneShot rules, suppress re-fires within this window (ms after
   * the last fire). Undefined / 0 = no cooldown.
   */
  cooldownMs?: number
  /** Free-form metadata propagated onto fired events. */
  metadata?: Readonly<Record<string, unknown>>
}

export interface AlertEvent {
  ruleId: string
  ruleName: string
  /** ms since epoch, passed in by the caller as `now`. */
  triggeredAt: number
  /** Snapshot of the bar that triggered the rule (copied, not referenced). */
  snapshotBar: MarketSnapshot['bar']
  metadata?: Readonly<Record<string, unknown>>
}

// ---------------------------------------------------------------------------
// AlertController — the public, framework-agnostic facade.
// ---------------------------------------------------------------------------

export interface AlertController {
  /** Current rules, in insertion order. Reactive. */
  readonly rules: Signal<ReadonlyArray<AlertRule>>
  /** Bounded ring of recent events, newest last. Reactive. */
  readonly events: Signal<ReadonlyArray<AlertEvent>>

  /** Add a rule; returns false if a rule with the same id already exists. */
  addRule(rule: AlertRule): boolean
  removeRule(id: string): boolean
  setRuleEnabled(id: string, enabled: boolean): boolean
  /** Patch any field except `id`. Returns false if the id is unknown. */
  updateRule(id: string, patch: Partial<Omit<AlertRule, 'id'>>): boolean

  /**
   * Evaluate every enabled rule against the snapshot. Returns the events
   * fired on this call (also appended to the `events` signal).
   */
  evaluate(snapshot: MarketSnapshot, now: number): ReadonlyArray<AlertEvent>

  clearEvents(): void
  /** Per-fire listener; returns an unsubscribe. */
  onEvent(listener: (event: AlertEvent) => void): () => void

  dispose(): void
}

export interface AlertControllerOptions {
  /** Maximum size of the `events` ring buffer. Default 100. */
  maxEvents?: number
}
