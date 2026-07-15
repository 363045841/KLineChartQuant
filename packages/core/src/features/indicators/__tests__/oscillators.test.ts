/**
 * Oscillator completion pack tests (B-10).
 *
 * Mixed input signatures across the 6:
 *   - close-only: StochRSI, DPO, STC
 *   - HL bars   : AO, Fisher Transform
 *   - OHLC bars : UO
 */

import { describe, it, expect } from 'vitest'

import { computeAwesomeOscillator } from '../awesomeOscillator'
import { computeDPO } from '../dpo'
import { computeFisherTransform } from '../fisherTransform'
import { computeSchaffTrendCycle } from '../schaffTrendCycle'
import { computeStochRSI } from '../stochRSI'
import { computeUltimateOscillator } from '../ultimateOscillator'

function ramp(n: number, start = 1, step = 1): number[] {
  return Array.from({ length: n }, (_, i) => start + step * i)
}

function constantClose(n: number, v: number): number[] {
  return Array.from({ length: n }, () => v)
}

function hlBars(n: number, mid = 100, spread = 1): Array<{ high: number; low: number }> {
  return Array.from({ length: n }, (_, i) => ({
    high: mid + i * 0.1 + spread / 2,
    low: mid + i * 0.1 - spread / 2,
  }))
}

function ohlcRamp(
  n: number,
  start = 100,
  step = 0.5,
): Array<{ high: number; low: number; close: number }> {
  return Array.from({ length: n }, (_, i) => {
    const c = start + step * i
    return { high: c + 0.5, low: c - 0.5, close: c }
  })
}

describe('computeStochRSI', () => {
  it('output length === input length and produces values in 0..100', () => {
    const { k, d } = computeStochRSI(ramp(60), {
      rsiPeriod: 14,
      stochPeriod: 14,
    })
    expect(k.length).toBe(60)
    expect(d.length).toBe(60)
    for (let i = 30; i < 60; i++) {
      const v = k[i]
      if (!Number.isNaN(v as number)) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(100)
      }
    }
  })

  it('throws on invalid period args', () => {
    expect(() => computeStochRSI(ramp(20), { rsiPeriod: 1, stochPeriod: 10 })).toThrow()
    expect(() => computeStochRSI(ramp(20), { rsiPeriod: 14, stochPeriod: 1 })).toThrow()
  })
})

describe('computeAwesomeOscillator', () => {
  it('output length === input length, leading NaN until slow window primed', () => {
    const r = computeAwesomeOscillator(hlBars(60), { fast: 5, slow: 34 })
    expect(r.length).toBe(60)
    for (let i = 0; i < 33; i++) expect(Number.isNaN(r[i] as number)).toBe(true)
    expect(Number.isNaN(r[33] as number)).toBe(false)
  })

  it('on a steady linear trend, AO is positive once primed (fast > slow)', () => {
    const r = computeAwesomeOscillator(hlBars(60, 100, 1), { fast: 5, slow: 34 })
    for (let i = 34; i < 60; i++) expect(r[i]).toBeGreaterThan(0)
  })

  it('rejects fast >= slow', () => {
    expect(() => computeAwesomeOscillator(hlBars(60), { fast: 10, slow: 10 })).toThrow()
  })
})

describe('computeUltimateOscillator', () => {
  it('output length === input length and 0..100 once primed', () => {
    const r = computeUltimateOscillator(ohlcRamp(80), { p1: 7, p2: 14, p3: 28 })
    expect(r.length).toBe(80)
    for (let i = 30; i < 80; i++) {
      const v = r[i] as number
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
  })

  it('rejects non-positive periods', () => {
    expect(() => computeUltimateOscillator(ohlcRamp(50), { p1: 0 })).toThrow()
  })
})

describe('computeDPO', () => {
  it('output length === input length and constant input → ~0 once primed', () => {
    const r = computeDPO(constantClose(40, 50), { period: 10 })
    expect(r.length).toBe(40)
    for (let i = 14; i < 40; i++) expect(r[i]!).toBeCloseTo(0, 9)
  })

  it('rejects period < 2', () => {
    expect(() => computeDPO(ramp(20), { period: 1 })).toThrow()
  })
})

describe('computeFisherTransform', () => {
  it('output length === input length; values primed after period', () => {
    const r = computeFisherTransform(hlBars(50), { period: 10 })
    expect(r.fisher.length).toBe(50)
    expect(r.trigger.length).toBe(50)
    for (let i = 0; i < 9; i++) expect(Number.isNaN(r.fisher[i] as number)).toBe(true)
    expect(Number.isNaN(r.fisher[10] as number)).toBe(false)
  })

  it('trigger == fisher shifted one bar', () => {
    const r = computeFisherTransform(hlBars(50), { period: 10 })
    for (let i = 12; i < 49; i++) {
      // trigger[i] is set to previous fisher value before the new fisher is committed.
      // We can confirm via the relationship inside the producer loop.
      const t = r.trigger[i + 1]
      const f = r.fisher[i]
      if (!Number.isNaN(t as number) && !Number.isNaN(f as number)) {
        expect(t).toBeCloseTo(f as number, 12)
      }
    }
  })
})

describe('computeSchaffTrendCycle', () => {
  it('output length === input length and values in [0, 100]', () => {
    const r = computeSchaffTrendCycle(ramp(100), { fast: 23, slow: 50, cycle: 10, factor: 0.5 })
    expect(r.length).toBe(100)
    for (let i = 70; i < 100; i++) {
      const v = r[i] as number
      if (!Number.isNaN(v)) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(100)
      }
    }
  })

  it('rejects bad args', () => {
    expect(() => computeSchaffTrendCycle(ramp(30), { fast: 50, slow: 23 })).toThrow()
    expect(() => computeSchaffTrendCycle(ramp(30), { cycle: 1 })).toThrow()
    expect(() => computeSchaffTrendCycle(ramp(30), { factor: 0 })).toThrow()
  })
})
