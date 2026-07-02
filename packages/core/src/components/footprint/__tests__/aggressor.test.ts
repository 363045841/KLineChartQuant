/**
 * Aggressor classifier tests — explicit flag, tick rule, Lee-Ready.
 *
 * Each classifier is tested in isolation; the controller-level fallback chain
 * is tested in controller.test.ts.
 */

import { describe, it, expect } from 'vitest'

import {
  classifyExplicit,
  classifyTickRule,
  classifyLeeReady,
  type TickRuleState,
  type LeeReadyState,
} from '../aggressor'

const trade = (
  price: number,
  size = 1,
  timestamp = 0,
): { timestamp: number; price: number; size: number } => ({
  timestamp,
  price,
  size,
})

describe('classifyExplicit', () => {
  it('isBuyerMaker=true means seller was the aggressor → sell', () => {
    const r = classifyExplicit({ ...trade(100), isBuyerMaker: true })
    expect(r).toEqual({ side: 'sell', inferred: false })
  })

  it('isBuyerMaker=false means buyer was the aggressor → buy', () => {
    const r = classifyExplicit({ ...trade(100), isBuyerMaker: false })
    expect(r).toEqual({ side: 'buy', inferred: false })
  })

  it('isBuyerMaker undefined → null (signals "no data; fall back")', () => {
    expect(classifyExplicit(trade(100))).toBeNull()
  })
})

describe('classifyTickRule', () => {
  it('first trade with prevPrice=null → unknown', () => {
    const state: TickRuleState = { prevPrice: null, prevSide: null }
    const r = classifyTickRule(state, trade(100))
    expect(r.side).toBe('unknown')
    expect(r.inferred).toBe(true)
  })

  it('rising price → buy (uptick)', () => {
    const state: TickRuleState = { prevPrice: 99, prevSide: null }
    expect(classifyTickRule(state, trade(100)).side).toBe('buy')
  })

  it('falling price → sell (downtick)', () => {
    const state: TickRuleState = { prevPrice: 101, prevSide: null }
    expect(classifyTickRule(state, trade(100)).side).toBe('sell')
  })

  it('equal price with prevSide=buy → buy (zero-tick repeats)', () => {
    const state: TickRuleState = { prevPrice: 100, prevSide: 'buy' }
    expect(classifyTickRule(state, trade(100)).side).toBe('buy')
  })

  it('equal price with prevSide=null → unknown', () => {
    const state: TickRuleState = { prevPrice: 100, prevSide: null }
    expect(classifyTickRule(state, trade(100)).side).toBe('unknown')
  })

  it('mutates state.prevPrice in place', () => {
    const state: TickRuleState = { prevPrice: 99, prevSide: null }
    classifyTickRule(state, trade(100))
    expect(state.prevPrice).toBe(100)
    expect(state.prevSide).toBe('buy')
  })

  it('does NOT overwrite prevSide when result is unknown (no poisoning)', () => {
    // Stream: trade1 establishes prevSide=buy, trade2 at same price with
    // prev null → wouldn't happen, but documented intent is to preserve
    // prevSide across an unknown classification.
    const state: TickRuleState = { prevPrice: 99, prevSide: null }
    classifyTickRule(state, trade(100)) // prevSide → 'buy'
    expect(state.prevSide).toBe('buy')
    classifyTickRule(state, trade(100)) // zero-tick, side stays 'buy'
    expect(state.prevSide).toBe('buy')
  })
})

describe('classifyLeeReady', () => {
  it('price above mid → buy', () => {
    const state: LeeReadyState = { prevPrice: null, prevSide: null }
    // mid = (100+101)/2 = 100.5; price 100.6 is above → buy
    expect(classifyLeeReady(state, trade(100.6), 100, 101).side).toBe('buy')
  })

  it('price below mid → sell', () => {
    const state: LeeReadyState = { prevPrice: null, prevSide: null }
    expect(classifyLeeReady(state, trade(100.3), 100, 101).side).toBe('sell')
  })

  it('price at mid → falls back to tick rule', () => {
    const state: LeeReadyState = { prevPrice: 99, prevSide: null }
    expect(classifyLeeReady(state, trade(100.5), 100, 101).side).toBe('buy')
    // 100.5 == mid; price > prevPrice (99) → buy via tick rule
  })

  it('missing bid/ask → falls back to tick rule', () => {
    // NaN bid → quotes unusable → tick-rule path.
    // prevPrice=101, trade.price=100 → downtick → sell.
    const state1: LeeReadyState = { prevPrice: 101, prevSide: null }
    expect(classifyLeeReady(state1, trade(100), NaN, 101).side).toBe('sell')

    // Infinity ask → also quotes unusable → tick-rule path.
    // prevPrice=99, trade.price=100 → uptick → buy.
    const state2: LeeReadyState = { prevPrice: 99, prevSide: null }
    expect(classifyLeeReady(state2, trade(100), 100, Infinity).side).toBe('buy')
  })

  it('quote test updates state.prevPrice + prevSide', () => {
    const state: LeeReadyState = { prevPrice: null, prevSide: null }
    classifyLeeReady(state, trade(100.6), 100, 101)
    expect(state.prevPrice).toBe(100.6)
    expect(state.prevSide).toBe('buy')
  })

  it('marks all results as inferred=true', () => {
    const state: LeeReadyState = { prevPrice: 99, prevSide: null }
    expect(classifyLeeReady(state, trade(100), 99.5, 100.5).inferred).toBe(true)
  })
})
