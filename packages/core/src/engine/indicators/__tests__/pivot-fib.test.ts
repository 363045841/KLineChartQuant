import { describe, expect, it } from 'vitest'

import { calcFibData } from '../calculators'

import { empty, pureDowntrend, pureUptrend, sideways, spikeAtBar19 } from './__fixtures__/synthetic'

describe('calcFibData', () => {
  it('empty returns empty', () => {
    expect(calcFibData(empty, 20)).toEqual([])
  })

  it('shorter than period returns all undefined', () => {
    const out = calcFibData(pureUptrend.slice(0, 10), 20)
    for (const v of out) expect(v).toBeUndefined()
  })

  it('on pureUptrend direction = up, levels descend from high to low', () => {
    const out = calcFibData(pureUptrend, 10)
    for (let t = 9; t < out.length; t++) {
      const p = out[t]!
      expect(p.direction).toBe('up')
      expect(p.high).toBeGreaterThan(p.low)
      expect(p.level236).toBeLessThan(p.high)
      expect(p.level236).toBeGreaterThan(p.level382)
      expect(p.level382).toBeGreaterThan(p.level500)
      expect(p.level500).toBeGreaterThan(p.level618)
      expect(p.level618).toBeGreaterThan(p.level786)
      expect(p.level786).toBeGreaterThan(p.low)
    }
  })

  it('on pureDowntrend direction = down, levels ascend from low to high', () => {
    const out = calcFibData(pureDowntrend, 10)
    for (let t = 9; t < out.length; t++) {
      const p = out[t]!
      expect(p.direction).toBe('down')
      expect(p.level236).toBeGreaterThan(p.low)
      expect(p.level236).toBeLessThan(p.level382)
      expect(p.level382).toBeLessThan(p.level500)
    }
  })

  it('50% level equals (high + low) / 2', () => {
    for (const fx of [pureUptrend, pureDowntrend, sideways, spikeAtBar19]) {
      const out = calcFibData(fx, 10)
      for (const p of out) {
        if (p) {
          expect(p.level500).toBeCloseTo((p.high + p.low) / 2, 9)
        }
      }
    }
  })
})
