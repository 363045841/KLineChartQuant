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

import { asReadonlySignal, batch, createSignal } from '@/foundation/reactivity/signal.js'

import type {
  AlertController,
  AlertControllerOptions,
  AlertEvent,
  AlertFailure,
  AlertRule,
  MarketSnapshot,
} from '../types.js'
import { evaluatePredicate } from './predicates.js'

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
  const rules = createSignal<readonly AlertRule[]>(Object.freeze([]))
  const events = createSignal<readonly AlertEvent[]>(Object.freeze([]))
  const failures = createSignal<readonly AlertFailure[]>(Object.freeze([]))

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
    copy[i] = Object.freeze(next)
    return Object.freeze(copy)
  }

  // -----------------------------------------------------------------------
  // addRule / removeRule / setRuleEnabled / updateRule
  // -----------------------------------------------------------------------

  function addRule(rule: AlertRule): boolean {
    if (findIndex(rule.id) >= 0) return false
    // Defensive shallow copy so external mutation of the caller's object
    // does not affect controller state.
    const stored: AlertRule = Object.freeze({
      ...rule,
      predicate: Object.freeze({ ...rule.predicate }),
      metadata: rule.metadata === undefined ? undefined : Object.freeze({ ...rule.metadata }),
    })
    runtime.set(rule.id, { prev: null, lastFiredAt: undefined })
    rules.set(Object.freeze([...rules.peek(), stored]))
    return true
  }

  function removeRule(id: string): boolean {
    const idx = findIndex(id)
    if (idx < 0) return false
    const copy = [...rules.peek()]
    copy.splice(idx, 1)
    runtime.delete(id)
    rules.set(Object.freeze(copy))
    return true
  }

  function setRuleEnabled(id: string, enabled: boolean): boolean {
    const idx = findIndex(id)
    if (idx < 0) return false
    const cur = rules.peek()[idx]!
    if (cur.enabled === enabled) return true // no-op but reports success
    const next: AlertRule = { ...cur, enabled }
    // Re-enabling resets prev — a freshly enabled cross rule should not
    // fire on the first eval just because the level is already broken.
    if (enabled) {
      runtime.set(id, { prev: null, lastFiredAt: undefined })
    }
    rules.set(replaceAt(rules.peek(), idx, next))
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
      predicate: patch.predicate === undefined ? cur.predicate : Object.freeze({ ...patch.predicate }),
      metadata: patch.metadata === undefined ? cur.metadata : Object.freeze({ ...patch.metadata }),
    }
    // Changing the predicate invalidates prev — different predicates may
    // need different prev fields, and a stale prev could cause a spurious
    // fire on next eval.
    if (patch.predicate !== undefined) {
      runtime.set(id, { prev: null, lastFiredAt: undefined })
    }
    rules.set(replaceAt(rules.peek(), idx, next))
    return true
  }

  // -----------------------------------------------------------------------
  // evaluate — the hot path. Safe to call every frame.
  // -----------------------------------------------------------------------

  function evaluate(snapshot: MarketSnapshot, now: number): ReadonlyArray<AlertEvent> {
    const fired: AlertEvent[] = []
    const failed: AlertFailure[] = []
    const currentRules = rules.peek()

    // We may need to flip oneShot rules off — collect indices and apply
    // once at the end to avoid mutating `currentRules` mid-loop.
    const toDisable = new Set<AlertRule>()

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
      } catch (error) {
        failed.push(Object.freeze({ ruleId: rule.id, stage: 'predicate', error }))
      }

      if (hit) {
        const event: AlertEvent = Object.freeze({
          ruleId: rule.id,
          ruleName: rule.name,
          triggeredAt: now,
          snapshotBar: snapshot.bar !== null ? Object.freeze({ ...snapshot.bar }) : null,
          metadata: rule.metadata,
        })
        fired.push(event)
        rt.lastFiredAt = now
        if (rule.oneShot) {
          toDisable.add(rule)
        }
      }

      rt.prev = snapshot
      runtime.set(rule.id, rt)
    }

    batch(() => {
      if (toDisable.size) {
        rules.set(Object.freeze(rules.peek().map((rule) =>
          toDisable.has(rule) ? Object.freeze({ ...rule, enabled: false }) : rule,
        )))
      }
      if (fired.length) events.set(Object.freeze(events.peek().concat(fired).slice(-maxEvents)))
      const snapshotListeners = [...listeners]
      for (const ev of fired) {
        for (const l of snapshotListeners) {
          try {
            l(ev)
          } catch (error) {
            failed.push(Object.freeze({ ruleId: ev.ruleId, stage: 'listener', error }))
          }
        }
      }
      if (failed.length || failures.peek().length) failures.set(Object.freeze(failed))
    })

    return fired
  }

  // -----------------------------------------------------------------------
  // events / listener management
  // -----------------------------------------------------------------------

  function clearEvents(): void {
    if (events.peek().length === 0) return
    events.set(Object.freeze([]))
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
    rules: asReadonlySignal(rules),
    events: asReadonlySignal(events),
    failures: asReadonlySignal(failures),
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
