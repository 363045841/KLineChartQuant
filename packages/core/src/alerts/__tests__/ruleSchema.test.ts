import { describe, it, expect } from 'vitest'

import { AlertRuleSchemaError, deserializeRule, serializeRule } from '../ruleSchema'
import type { AlertRule } from '../types'

const baseRule = (predicateOverride: AlertRule['predicate']): AlertRule => ({
  id: 'r1',
  name: 'Test Rule',
  predicate: predicateOverride,
  enabled: true,
  oneShot: false,
})

describe('serialize / deserialize roundtrip', () => {
  it('round-trips a price-cross rule', () => {
    const r = baseRule({ kind: 'price-cross', price: 100, direction: 'up' })
    const back = deserializeRule(serializeRule(r))
    expect(back).toEqual(r)
  })

  it('round-trips price-in-range and price-out-of-range rules', () => {
    const a = baseRule({ kind: 'price-in-range', min: 90, max: 110 })
    const b = baseRule({ kind: 'price-out-of-range', min: 90, max: 110 })
    expect(deserializeRule(serializeRule(a))).toEqual(a)
    expect(deserializeRule(serializeRule(b))).toEqual(b)
  })

  it('round-trips both indicator predicates', () => {
    const single = baseRule({
      kind: 'indicator-cross',
      indicatorId: 'rsi',
      threshold: 70,
      direction: 'down',
    })
    const pair = baseRule({
      kind: 'indicator-cross-indicator',
      aId: 'ema12',
      bId: 'ema26',
      direction: 'a-above-b',
    })
    expect(deserializeRule(serializeRule(single))).toEqual(single)
    expect(deserializeRule(serializeRule(pair))).toEqual(pair)
  })

  it('round-trips advanced component predicates', () => {
    const a = baseRule({
      kind: 'volume-spike',
      multipleOfAvg: 4,
      lookbackBars: 30,
    })
    const b = baseRule({
      kind: 'volume-profile-poc-touch',
      bandPercent: 0.005,
    })
    const c = baseRule({
      kind: 'order-book-wall',
      sizeMultipleOfMedian: 8,
    })
    const d = baseRule({
      kind: 'footprint-imbalance',
      minImbalanceRatio: 3,
      consecutivePriceLevels: 3,
    })
    for (const rule of [a, b, c, d]) {
      expect(deserializeRule(serializeRule(rule))).toEqual(rule)
    }
  })

  it('round-trips optional fields (cooldownMs, metadata)', () => {
    const r: AlertRule = {
      id: 'r-meta',
      name: 'with extras',
      predicate: { kind: 'price-cross', price: 100, direction: 'any' },
      enabled: true,
      oneShot: false,
      cooldownMs: 60_000,
      metadata: { author: 'alice', tag: 'breakout' },
    }
    const back = deserializeRule(serializeRule(r))
    expect(back).toEqual(r)
  })
})

describe('custom predicate is never serialised (security)', () => {
  it('throws with a clear security-related message when serialising custom', () => {
    const r: AlertRule = baseRule({
      kind: 'custom',
      evaluate: () => true,
    })
    let err: unknown
    try {
      serializeRule(r)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(AlertRuleSchemaError)
    // The message must mention the security reason. We assert on the
    // key phrase so renaming for cosmetics still keeps the contract.
    expect((err as Error).message).toMatch(/custom/i)
    expect((err as Error).message).toMatch(/serialis|code|RCE/i)
  })

  it("refuses to deserialise a payload claiming kind: 'custom'", () => {
    // Even a perfectly-shaped JSON impersonating a custom predicate must
    // be rejected — the absence of `evaluate` cannot be re-created safely.
    const malicious = JSON.stringify({
      id: 'evil',
      name: 'Evil',
      predicate: { kind: 'custom', source: 'fetch("/cookies")' },
      enabled: true,
      oneShot: false,
    })
    expect(() => deserializeRule(malicious)).toThrow(AlertRuleSchemaError)
  })
})

describe('deserialize: error paths', () => {
  it('rejects malformed JSON', () => {
    expect(() => deserializeRule('not-json')).toThrow(AlertRuleSchemaError)
    expect(() => deserializeRule('{')).toThrow(AlertRuleSchemaError)
  })

  it('rejects an unknown predicate kind', () => {
    const payload = JSON.stringify({
      id: 'r',
      name: 'r',
      predicate: { kind: 'made-up-thing', x: 1 },
      enabled: true,
      oneShot: false,
    })
    expect(() => deserializeRule(payload)).toThrow(AlertRuleSchemaError)
  })

  it('rejects missing required scalar fields', () => {
    const payload = JSON.stringify({
      id: 'r',
      // name missing
      predicate: { kind: 'price-cross', price: 100, direction: 'up' },
      enabled: true,
      oneShot: false,
    })
    expect(() => deserializeRule(payload)).toThrow(AlertRuleSchemaError)
  })

  it('rejects non-finite numbers (NaN, Infinity)', () => {
    // JSON.stringify drops NaN/Infinity as null, so build the payload
    // by hand to actually transport the bad number.
    const payload =
      '{"id":"r","name":"r","predicate":{"kind":"price-cross","price":null,"direction":"up"},"enabled":true,"oneShot":false}'
    expect(() => deserializeRule(payload)).toThrow(AlertRuleSchemaError)
  })

  it('tolerates omitted optional fields', () => {
    const payload = JSON.stringify({
      id: 'r',
      name: 'r',
      predicate: { kind: 'price-in-range', min: 1, max: 2 },
      enabled: false,
      oneShot: true,
      // cooldownMs + metadata omitted
    })
    const rule = deserializeRule(payload)
    expect(rule.cooldownMs).toBeUndefined()
    expect(rule.metadata).toBeUndefined()
  })

  it('rejects metadata that is not an object', () => {
    const payload = JSON.stringify({
      id: 'r',
      name: 'r',
      predicate: { kind: 'price-in-range', min: 1, max: 2 },
      enabled: true,
      oneShot: false,
      metadata: 'not-an-object',
    })
    expect(() => deserializeRule(payload)).toThrow(AlertRuleSchemaError)
  })
})
