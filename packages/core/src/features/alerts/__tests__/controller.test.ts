import { describe, it, expect, vi } from 'vitest'

import { createAlertController } from '../createAlertController'
import type { AlertRule, MarketSnapshot } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function snap(close: number, volume = 1000, ts = 1): MarketSnapshot {
  return {
    bar: { timestamp: ts, open: close, high: close, low: close, close, volume },
    indicators: {},
    rollingVolume: {},
  }
}

const ruleCrossUp100: AlertRule = {
  id: 'r-up-100',
  name: 'cross up 100',
  predicate: { kind: 'price-cross', price: 100, direction: 'up' },
  enabled: true,
  oneShot: false,
}

// ---------------------------------------------------------------------------
// add / remove / update / enable
// ---------------------------------------------------------------------------

describe('controller: rule CRUD', () => {
  it('adds a rule and rejects duplicate ids', () => {
    const c = createAlertController()
    expect(c.addRule(ruleCrossUp100)).toBe(true)
    expect(c.addRule(ruleCrossUp100)).toBe(false)
    expect(c.rules().length).toBe(1)
  })

  it('removes a rule by id', () => {
    const c = createAlertController()
    c.addRule(ruleCrossUp100)
    expect(c.removeRule('does-not-exist')).toBe(false)
    expect(c.removeRule('r-up-100')).toBe(true)
    expect(c.rules().length).toBe(0)
  })

  it('toggles enabled', () => {
    const c = createAlertController()
    c.addRule(ruleCrossUp100)
    expect(c.setRuleEnabled('r-up-100', false)).toBe(true)
    expect(c.rules()[0]!.enabled).toBe(false)
    expect(c.setRuleEnabled('missing', true)).toBe(false)
  })

  it('patches arbitrary fields via updateRule, preserving id', () => {
    const c = createAlertController()
    c.addRule(ruleCrossUp100)
    c.updateRule('r-up-100', { name: 'renamed', cooldownMs: 5000 })
    const r = c.rules()[0]!
    expect(r.id).toBe('r-up-100')
    expect(r.name).toBe('renamed')
    expect(r.cooldownMs).toBe(5000)
  })
})

// ---------------------------------------------------------------------------
// evaluate
// ---------------------------------------------------------------------------

describe('controller: evaluate', () => {
  it('fires events for matching rules and appends to the events signal', () => {
    const c = createAlertController()
    c.addRule(ruleCrossUp100)
    // First eval: prev is null → cross predicates cannot fire (by design).
    const first = c.evaluate(snap(99), 1)
    expect(first.length).toBe(0)
    // Second eval crosses through 100 → fires.
    const second = c.evaluate(snap(101), 2)
    expect(second.length).toBe(1)
    expect(second[0]!.ruleId).toBe('r-up-100')
    expect(c.events().length).toBe(1)
  })

  it('skips disabled rules during evaluate', () => {
    const c = createAlertController()
    c.addRule({ ...ruleCrossUp100, enabled: false })
    c.evaluate(snap(99), 1)
    const fired = c.evaluate(snap(101), 2)
    expect(fired.length).toBe(0)
  })

  it('oneShot rule auto-disables after firing once', () => {
    const c = createAlertController()
    c.addRule({ ...ruleCrossUp100, oneShot: true })
    c.evaluate(snap(99), 1)
    const fire1 = c.evaluate(snap(101), 2)
    expect(fire1.length).toBe(1)
    expect(c.rules()[0]!.enabled).toBe(false)
    // A subsequent down-and-back-up sequence must NOT fire again because
    // the rule is disabled.
    const fire2 = c.evaluate(snap(99), 3)
    const fire3 = c.evaluate(snap(101), 4)
    expect(fire2.length).toBe(0)
    expect(fire3.length).toBe(0)
  })

  it('cooldownMs suppresses re-fires within the window', () => {
    const c = createAlertController()
    c.addRule({
      ...ruleCrossUp100,
      cooldownMs: 1000,
      predicate: { kind: 'price-cross', price: 100, direction: 'any' },
    })
    // priming eval so prev is set
    c.evaluate(snap(99), 0)
    // First fire (up cross)
    expect(c.evaluate(snap(101), 100).length).toBe(1)
    // Within cooldown: down-cross would fire normally, but is suppressed.
    expect(c.evaluate(snap(99), 500).length).toBe(0)
    // Outside cooldown: next cross fires again.
    expect(c.evaluate(snap(101), 2000).length).toBe(1)
  })

  it('clears events from the signal', () => {
    const c = createAlertController()
    c.addRule(ruleCrossUp100)
    c.evaluate(snap(99), 1)
    c.evaluate(snap(101), 2)
    expect(c.events().length).toBe(1)
    c.clearEvents()
    expect(c.events().length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// onEvent listener
// ---------------------------------------------------------------------------

describe('controller: onEvent', () => {
  it('invokes the listener on each fire and cleans up on unsubscribe', () => {
    const c = createAlertController()
    c.addRule(ruleCrossUp100)
    const listener = vi.fn()
    const unsub = c.onEvent(listener)
    c.evaluate(snap(99), 1)
    c.evaluate(snap(101), 2)
    expect(listener).toHaveBeenCalledTimes(1)
    unsub()
    // After unsubscribe the listener should not be called again
    c.evaluate(snap(99), 3)
    c.evaluate(snap(101), 4)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// maxEvents bound
// ---------------------------------------------------------------------------

describe('controller: maxEvents ring', () => {
  it('bounds the events signal to maxEvents items, keeping the newest', () => {
    const c = createAlertController({ maxEvents: 3 })
    // a rule that always fires using custom predicate
    c.addRule({
      id: 'always',
      name: 'always',
      predicate: { kind: 'custom', evaluate: () => true },
      enabled: true,
      oneShot: false,
    })
    for (let i = 0; i < 10; i++) c.evaluate(snap(100 + i), i)
    const evs = c.events()
    expect(evs.length).toBe(3)
    // Last fire should reflect the newest `now` (=9).
    expect(evs[evs.length - 1]!.triggeredAt).toBe(9)
  })
})

// ---------------------------------------------------------------------------
// custom predicate sandbox (verified in controller too)
// ---------------------------------------------------------------------------

describe('controller: custom predicate sandbox', () => {
  it('does not crash the alert pass when a custom predicate throws', () => {
    const c = createAlertController()
    c.addRule({
      id: 'boom',
      name: 'boom',
      predicate: {
        kind: 'custom',
        evaluate: () => {
          throw new Error('user code blew up')
        },
      },
      enabled: true,
      oneShot: false,
    })
    c.addRule({
      id: 'ok',
      name: 'ok',
      predicate: { kind: 'custom', evaluate: () => true },
      enabled: true,
      oneShot: false,
    })

    // The throwing rule must NOT take down the OK rule. The whole call
    // must complete without throwing, and the OK rule must still fire.
    let fired: ReturnType<typeof c.evaluate> | undefined
    expect(() => {
      fired = c.evaluate(snap(100), 1)
    }).not.toThrow()
    expect(fired).toBeDefined()
    expect(fired!.length).toBe(1)
    expect(fired![0]!.ruleId).toBe('ok')
  })
})

// ---------------------------------------------------------------------------
// dispose
// ---------------------------------------------------------------------------

describe('controller: dispose', () => {
  it('silences subsequent mutations and evaluations', () => {
    const c = createAlertController()
    c.addRule(ruleCrossUp100)
    c.dispose()
    // Mutators are guarded — they return their fallback value.
    expect(c.addRule({ ...ruleCrossUp100, id: 'r2' })).toBe(false)
    expect(c.removeRule('r-up-100')).toBe(false)
    expect(c.setRuleEnabled('r-up-100', false)).toBe(false)
    expect(c.evaluate(snap(101), 1)).toEqual([])
  })
})
