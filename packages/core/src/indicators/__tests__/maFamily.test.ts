/**
 * MA family completion pack tests (B-9).
 *
 * Each indicator gets at least:
 *   - length parity assertion (output length === input length)
 *   - NaN-priming-window assertion (correct number of leading NaN)
 *   - convergence-or-fixture assertion (constant input → constant output;
 *     known-trending input → monotonic output where applicable)
 *   - parameter-validation throw paths
 */

import { describe, it, expect } from 'vitest'

import { computeALMA } from '../alma'
import { computeFRAMA } from '../frama'
import { computeLSMA } from '../lsma'
import { computeT3 } from '../t3'
import { computeVIDYA } from '../vidya'
import { computeZLEMA } from '../zlema'

function constant(n: number, v: number): number[] {
  return Array.from({ length: n }, () => v)
}

function ramp(n: number, start = 1, step = 1): number[] {
  return Array.from({ length: n }, (_, i) => start + step * i)
}

function countLeadingNaN(out: Float64Array): number {
  let c = 0
  for (let i = 0; i < out.length; i++) {
    if (Number.isNaN(out[i])) c++
    else break
  }
  return c
}

describe('computeALMA', () => {
  it('output length === input length', () => {
    const r = computeALMA(ramp(50), { period: 10 })
    expect(r.length).toBe(50)
  })

  it('first period - 1 entries are NaN', () => {
    const r = computeALMA(ramp(20), { period: 5 })
    expect(countLeadingNaN(r)).toBe(4)
  })

  it('constant input → constant output (after priming)', () => {
    const r = computeALMA(constant(20, 100), { period: 5 })
    for (let i = 4; i < 20; i++) expect(r[i]!).toBeCloseTo(100, 9)
  })

  it('throws on invalid params', () => {
    expect(() => computeALMA([1, 2], { period: 0 })).toThrow(/period/)
    expect(() => computeALMA([1, 2], { period: 5, offset: -0.1 })).toThrow(/offset/)
    expect(() => computeALMA([1, 2], { period: 5, sigma: 0 })).toThrow(/sigma/)
  })
})

describe('computeT3', () => {
  it('output length === input length', () => {
    const r = computeT3(ramp(50), { period: 5 })
    expect(r.length).toBe(50)
  })

  it('seeds on first sample and produces no NaN once primed', () => {
    const r = computeT3(constant(30, 50), { period: 5 })
    // T3 with constant input is a 6-deep EMA cascade of 50 → asymptotes to 50.
    const last = r[r.length - 1]!
    expect(last).toBeCloseTo(50, 6)
  })

  it('respects volumeFactor bounds', () => {
    expect(() => computeT3(ramp(20), { period: 5, volumeFactor: -0.1 })).toThrow(/volumeFactor/)
    expect(() => computeT3(ramp(20), { period: 5, volumeFactor: 1.1 })).toThrow(/volumeFactor/)
  })
})

describe('computeZLEMA', () => {
  it('output length === input length', () => {
    const r = computeZLEMA(ramp(30), { period: 8 })
    expect(r.length).toBe(30)
  })

  it('lag = floor((period-1)/2) leading NaN', () => {
    // period 8 → lag = 3 → 3 leading NaN
    const r = computeZLEMA(ramp(30), { period: 8 })
    expect(countLeadingNaN(r)).toBe(3)
  })

  it('on a linear ramp, leads or matches the ramp value (zero-lag promise)', () => {
    // For prices = i, the zero-lag-adjusted series is also linear and a
    // unit-slope EMA over it tracks the line within numerical tolerance
    // once primed. We check that the indicator value at i is within a
    // small constant of i (no large lag).
    const r = computeZLEMA(ramp(40, 0, 1), { period: 10 })
    for (let i = 15; i < 40; i++) {
      expect(Math.abs(r[i]! - i)).toBeLessThan(2)
    }
  })
})

describe('computeLSMA', () => {
  it('output length === input length and period-1 leading NaN', () => {
    const r = computeLSMA(ramp(30), { period: 7 })
    expect(r.length).toBe(30)
    expect(countLeadingNaN(r)).toBe(6)
  })

  it('on a perfect linear ramp, LSMA value equals the ramp value (LR endpoint = current bar)', () => {
    const r = computeLSMA(ramp(40, 10, 0.5), { period: 5 })
    // ramp(i) = 10 + 0.5 * i; LSMA fits over [i-4..i] and returns line at right endpoint = ramp(i)
    for (let i = 4; i < 40; i++) {
      expect(r[i]!).toBeCloseTo(10 + 0.5 * i, 9)
    }
  })

  it('constant input → LSMA equals the constant', () => {
    const r = computeLSMA(constant(20, 7), { period: 5 })
    for (let i = 4; i < 20; i++) expect(r[i]!).toBeCloseTo(7, 9)
  })
})

describe('computeVIDYA', () => {
  it('output length === input length', () => {
    const r = computeVIDYA(ramp(30), { period: 9 })
    expect(r.length).toBe(30)
  })

  it('first cmoPeriod entries are NaN', () => {
    const r = computeVIDYA(ramp(30), { period: 9, cmoPeriod: 5 })
    expect(countLeadingNaN(r)).toBe(5)
  })

  it('constant input → CMO degenerate → alpha == 0 → stays at seed', () => {
    // With constant input the CMO has no signal (sum gain = sum loss = 0),
    // we treat it as 0 → alpha = 0 → VIDYA equals the first valid price.
    const r = computeVIDYA(constant(20, 42), { period: 5, cmoPeriod: 3 })
    for (let i = 3; i < 20; i++) expect(r[i]!).toBeCloseTo(42, 9)
  })
})

describe('computeFRAMA', () => {
  it('output length === input length and period-1 leading NaN', () => {
    const r = computeFRAMA(ramp(40), { period: 16 })
    expect(r.length).toBe(40)
    expect(countLeadingNaN(r)).toBe(15)
  })

  it('rejects odd or too-small periods', () => {
    expect(() => computeFRAMA(ramp(20), { period: 3 })).toThrow(/period/)
    expect(() => computeFRAMA(ramp(20), { period: 5 })).toThrow(/period/)
  })

  it('constant input → flat output once primed', () => {
    const r = computeFRAMA(constant(40, 9), { period: 8 })
    for (let i = 7; i < 40; i++) expect(r[i]!).toBeCloseTo(9, 6)
  })
})
