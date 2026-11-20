import { describe, expect, it } from 'vitest'

import { AlertRuleSchemaError, deserializeRule, serializeRule } from '../impl/ruleSchema'
import type { AlertRule } from '../types'

const baseRule = (predicateOverride: AlertRule['predicate']): AlertRule => ({
  id: 'r1',
  name: 'Test Rule',
  predicate: predicateOverride,
  enabled: true,
  oneShot: false,
})

describe('serialize / deserialize roundtrip', () => {
  it.each([
    { kind: 'price-cross', price: 100, direction: 'up' },
    { kind: 'price-in-range', min: 90, max: 110 },
    { kind: 'price-out-of-range', min: 90, max: 110 },
    { kind: 'indicator-cross', indicatorId: 'rsi', threshold: 70, direction: 'down' },
    { kind: 'indicator-cross-indicator', aId: 'ema12', bId: 'ema26', direction: 'a-above-b' },
    { kind: 'volume-spike', multipleOfAvg: 4, lookbackBars: 30 },
    { kind: 'volume-profile-poc-touch', bandPercent: 0.005 },
    { kind: 'order-book-wall', sizeMultipleOfMedian: 8 },
    { kind: 'footprint-imbalance', minImbalanceRatio: 3, consecutivePriceLevels: 3 },
  ] satisfies Array<AlertRule['predicate']>)('round-trips $kind', (predicate) => {
    const rule = baseRule(predicate)
    expect(deserializeRule(serializeRule(rule))).toEqual(rule)
  })

  it('round-trips optional fields (cooldownMs, metadata)', () => {
    const rule: AlertRule = {
      id: 'r-meta',
      name: 'with extras',
      predicate: { kind: 'price-cross', price: 100, direction: 'any' },
      enabled: true,
      oneShot: false,
      cooldownMs: 60_000,
      metadata: { author: 'alice', tag: 'breakout' },
    }
    expect(deserializeRule(serializeRule(rule))).toEqual(rule)
  })
})

describe('custom predicate is never serialised (security)', () => {
  it('throws with a clear security-related message when serialising custom', () => {
    const rule = baseRule({ kind: 'custom', evaluate: () => true })
    let error: unknown
    try {
      serializeRule(rule)
    } catch (thrown) {
      error = thrown
    }
    expect(error).toBeInstanceOf(AlertRuleSchemaError)
    // 只断言关键短语，文案调整不影响契约。
    expect((error as Error).message).toMatch(/custom/i)
    expect((error as Error).message).toMatch(/serialis|code|RCE/i)
  })

  it("refuses to deserialise a payload claiming kind: 'custom'", () => {
    // 即使 JSON 形状完美，缺少 evaluate 也无法安全重建，必须拒绝。
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

describe('deserialize 错误路径', () => {
  it.each([
    { name: 'malformed JSON', payload: 'not-json' },
    { name: 'truncated JSON', payload: '{' },
    {
      name: 'unknown predicate kind',
      payload: JSON.stringify({
        id: 'r',
        name: 'r',
        predicate: { kind: 'made-up-thing', x: 1 },
        enabled: true,
        oneShot: false,
      }),
    },
    {
      name: 'missing required name',
      payload: JSON.stringify({
        id: 'r',
        predicate: { kind: 'price-cross', price: 100, direction: 'up' },
        enabled: true,
        oneShot: false,
      }),
    },
    {
      // JSON.stringify 会把 NaN/Infinity 变成 null，这里手工构造真实坏值。
      name: 'non-finite number',
      payload:
        '{"id":"r","name":"r","predicate":{"kind":"price-cross","price":null,"direction":"up"},"enabled":true,"oneShot":false}',
    },
    {
      name: 'non-object metadata',
      payload: JSON.stringify({
        id: 'r',
        name: 'r',
        predicate: { kind: 'price-in-range', min: 1, max: 2 },
        enabled: true,
        oneShot: false,
        metadata: 'not-an-object',
      }),
    },
  ])('rejects $name', ({ payload }) => {
    expect(() => deserializeRule(payload)).toThrow(AlertRuleSchemaError)
  })

  it('tolerates omitted optional fields', () => {
    const payload = JSON.stringify({
      id: 'r',
      name: 'r',
      predicate: { kind: 'price-in-range', min: 1, max: 2 },
      enabled: false,
      oneShot: true,
    })
    const rule = deserializeRule(payload)
    expect(rule.cooldownMs).toBeUndefined()
    expect(rule.metadata).toBeUndefined()
  })
})
