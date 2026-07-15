/**
 * AlertController — framework-agnostic, signal-based.
 *
 * Same dispose-guard pattern as the other core controllers (volume-profile,
 * indicator-selector). Adapters (React/Vue/Angular) subscribe to the
 * `rules` and `events` signals via their native reactivity.
 *
 * Per-rule prev-snapshot:
 *   Cross-style predicates compare prev vs. curr. Rather than asking the
 *   caller to thread that state, the controller stashes the previous
 *   evaluation snapshot per rule id and feeds it back into the predicate.
 *   When a rule is added or re-enabled, its prev is reset — that prevents
 *   a spurious fire on first evaluation (a newly-added "price-cross 100"
 *   rule should NOT fire just because the current close happens to be 105).
 *
 * Cooldown:
 *   For non-oneShot rules we record `lastFiredAt` and suppress re-fires
 *   within `cooldownMs`. oneShot ignores cooldown — it just flips
 *   `enabled` to false on first fire.
 *
 * Crash safety:
 *   `kind: 'custom'` predicates run inside try/catch. A throwing predicate
 *   is caught, marked internally, and skipped for this pass; the rest of
 *   the rules continue to evaluate. Errors are swallowed at the boundary
 *   (no console.* per coding-style.md) — observability hooks are a future
 *   addition (`onError` listener on the controller).
 */

import { createSignal, type Signal } from '../../foundation/reactivity/signal'

import { evaluatePredicate } from './predicates'
import type {
  AlertController,
  AlertControllerOptions,
  AlertEvent,
  AlertRule,
  MarketSnapshot,
} from './types'

const DEFAULT_MAX_EVENTS = 100

interface RuleRuntimeState {
  /** Snapshot from the previous evaluation, for cross-style predicates. */
  prev: MarketSnapshot | null
  /** ms timestamp of last fire (for cooldown). undefined = never fired. */
  lastFiredAt: number | undefined
}

export function createAlertController(opts?: AlertControllerOptions): AlertController {
  const maxEvents = (() => {
    const raw = opts?.maxEvents
    if (raw === undefined) return DEFAULT_MAX_EVENTS
    if (!Number.isFinite(raw) || raw < 1) return DEFAULT_MAX_EVENTS
    return Math.floor(raw)
  })()

  // -----------------------------------------------------------------------
  // Signals — frozen arrays so React/Vue see new identity on every change.
  // -----------------------------------------------------------------------
  const rules: Signal<ReadonlyArray<AlertRule>> = createSignal<ReadonlyArray<AlertRule>>([])
  const events: Signal<ReadonlyArray<AlertEvent>> = createSignal<ReadonlyArray<AlertEvent>>([])

  // -----------------------------------------------------------------------
  // Private state
  // -----------------------------------------------------------------------
  const runtime = new Map<string, RuleRuntimeState>()
  const listeners = new Set<(event: AlertEvent) => void>()

  let disposed = false

  function findIndex(id: string): number {
    const arr = rules.peek()
    for (let i = 0; i < arr.length; i++) {
      if (arr[i]!.id === id) return i
    }
    return -1
  }

  function replaceAt(
    arr: ReadonlyArray<AlertRule>,
    i: number,
    next: AlertRule,
  ): ReadonlyArray<AlertRule> {
    const copy = [...arr]
    copy[i] = next
    return copy
  }

  // -----------------------------------------------------------------------
  // addRule / removeRule / setRuleEnabled / updateRule
  // -----------------------------------------------------------------------

  function addRule(rule: AlertRule): boolean {
    if (findIndex(rule.id) >= 0) return false
    // Defensive shallow copy so external mutation of the caller's object
    // does not affect controller state.
    const stored: AlertRule = {
      ...rule,
      metadata: rule.metadata !== undefined ? { ...rule.metadata } : undefined,
    }
    rules.set([...rules.peek(), stored])
    runtime.set(rule.id, { prev: null, lastFiredAt: undefined })
    return true
  }

  function removeRule(id: string): boolean {
    const idx = findIndex(id)
    if (idx < 0) return false
    const copy = [...rules.peek()]
    copy.splice(idx, 1)
    rules.set(copy)
    runtime.delete(id)
    return true
  }

  function setRuleEnabled(id: string, enabled: boolean): boolean {
    const idx = findIndex(id)
    if (idx < 0) return false
    const cur = rules.peek()[idx]!
    if (cur.enabled === enabled) return true // no-op but reports success
    const next: AlertRule = { ...cur, enabled }
    rules.set(replaceAt(rules.peek(), idx, next))
    // Re-enabling resets prev — a freshly enabled cross rule should not
    // fire on the first eval just because the level is already broken.
    if (enabled) {
      runtime.set(id, { prev: null, lastFiredAt: undefined })
    }
    return true
  }

  function updateRule(id: string, patch: Partial<Omit<AlertRule, 'id'>>): boolean {
    const idx = findIndex(id)
    if (idx < 0) return false
    const cur = rules.peek()[idx]!
    const next: AlertRule = {
      ...cur,
      ...patch,
      id: cur.id, // id is invariant
      metadata: patch.metadata !== undefined ? { ...patch.metadata } : cur.metadata,
    }
    rules.set(replaceAt(rules.peek(), idx, next))
    // Changing the predicate invalidates prev — different predicates may
    // need different prev fields, and a stale prev could cause a spurious
    // fire on next eval.
    if (patch.predicate !== undefined) {
      runtime.set(id, { prev: null, lastFiredAt: undefined })
    }
    return true
  }

  // -----------------------------------------------------------------------
  // evaluate — the hot path. Safe to call every frame.
  // -----------------------------------------------------------------------

  function evaluate(snapshot: MarketSnapshot, now: number): ReadonlyArray<AlertEvent> {
    const fired: AlertEvent[] = []
    const currentRules = rules.peek()

    // We may need to flip oneShot rules off — collect indices and apply
    // once at the end to avoid mutating `currentRules` mid-loop.
    const toDisable: number[] = []

    for (let i = 0; i < currentRules.length; i++) {
      const rule = currentRules[i]!
      if (!rule.enabled) continue

      const rt = runtime.get(rule.id) ?? {
        prev: null,
        lastFiredAt: undefined,
      }
      // Cooldown gate (applies to non-oneShot rules; oneShot rules
      // can only fire once anyway).
      if (
        !rule.oneShot &&
        rule.cooldownMs !== undefined &&
        rule.cooldownMs > 0 &&
        rt.lastFiredAt !== undefined &&
        now - rt.lastFiredAt < rule.cooldownMs
      ) {
        // Still update prev so the next eval after cooldown has the
        // right reference point for cross detection.
        rt.prev = snapshot
        runtime.set(rule.id, rt)
        continue
      }

      // Evaluate. Custom predicates can throw — wrap.
      let hit = false
      try {
        hit = evaluatePredicate(rule.predicate, snapshot, rt.prev)
      } catch {
        // Swallow per crash-safety contract. Do NOT fire. Continue.
        hit = false
      }

      if (hit) {
        const event: AlertEvent = {
          ruleId: rule.id,
          ruleName: rule.name,
          triggeredAt: now,
          snapshotBar: snapshot.bar !== null ? { ...snapshot.bar } : null,
          metadata: rule.metadata,
        }
        fired.push(event)
        rt.lastFiredAt = now
        if (rule.oneShot) {
          toDisable.push(i)
        }
      }

      rt.prev = snapshot
      runtime.set(rule.id, rt)
    }

    if (fired.length > 0) {
      // Append fired events to the ring, capped at maxEvents.
      const prevEvents = events.peek()
      const merged = prevEvents.concat(fired)
      const trimmed = merged.length > maxEvents ? merged.slice(merged.length - maxEvents) : merged
      events.set(trimmed)

      // Notify per-event listeners. Copy first so a listener that
      // unsubscribes during fire-out doesn't mutate the iteration.
      const snapshotListeners = [...listeners]
      for (const ev of fired) {
        for (const l of snapshotListeners) {
          try {
            l(ev)
          } catch {
            // listener errors are isolated — never leak across.
          }
        }
      }
    }

    if (toDisable.length > 0) {
      const copy = [...rules.peek()]
      for (const i of toDisable) {
        const r = copy[i]
        if (r !== undefined) copy[i] = { ...r, enabled: false }
      }
      rules.set(copy)
    }

    return fired
  }

  // -----------------------------------------------------------------------
  // events / listener management
  // -----------------------------------------------------------------------

  function clearEvents(): void {
    if (events.peek().length === 0) return
    events.set([])
  }

  function onEvent(listener: (event: AlertEvent) => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  // -----------------------------------------------------------------------
  // dispose
  // -----------------------------------------------------------------------

  function dispose(): void {
    if (disposed) return
    disposed = true
    listeners.clear()
    runtime.clear()
  }

  function guard<T extends (...args: never[]) => unknown>(fn: T, fallback: ReturnType<T>): T {
    return ((...args: Parameters<T>): ReturnType<T> => {
      if (disposed) return fallback
      return fn(...args) as ReturnType<T>
    }) as T
  }

  return {
    rules,
    events,
    addRule: guard(addRule, false as boolean) as AlertController['addRule'],
    removeRule: guard(removeRule, false as boolean) as AlertController['removeRule'],
    setRuleEnabled: guard(setRuleEnabled, false as boolean) as AlertController['setRuleEnabled'],
    updateRule: guard(updateRule, false as boolean) as AlertController['updateRule'],
    evaluate: guard(evaluate, [] as ReadonlyArray<AlertEvent>) as AlertController['evaluate'],
    clearEvents: guard(clearEvents, undefined as void) as AlertController['clearEvents'],
    onEvent: guard(onEvent, (() => undefined) as () => void) as AlertController['onEvent'],
    dispose,
  }
}
