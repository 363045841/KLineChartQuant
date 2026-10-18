import { describe, expect, it } from 'vitest'

import { calcOBVData, calcPVTData } from '../calculators'

import {
  constantPrice,
  empty,
  pureDowntrend,
  pureUptrend,
  sideways,
  spikeAtBar19,
} from './__fixtures__/synthetic'

describe('calcOBVData', () => {
  it('empty returns empty', () => {
    expect(calcOBVData(empty)).toEqual([])
  })

  it('starts at 0', () => {
    const out = calcOBVData(pureUptrend)
    expect(out[0]).toBe(0)
  })

  it('on pureUptrend OBV monotonically increases (every Δclose > 0 → +volume)', () => {
    const out = calcOBVData(pureUptrend)
    for (let t = 1; t < out.length; t++) {
      expect(out[t]!).toBeGreaterThanOrEqual(out[t - 1]!)
    }
  })

  it('on pureDowntrend OBV monotonically decreases', () => {
    const out = calcOBVData(pureDowntrend)
    for (let t = 1; t < out.length; t++) {
      expect(out[t]!).toBeLessThanOrEqual(out[t - 1]!)
    }
  })

  it('on constantPrice (no Δclose) OBV stays at 0', () => {
    const out = calcOBVData(constantPrice)
    for (const v of out) expect(v).toBe(0)
  })

  it('extensional consistency on spike fixture', () => {
    const full = calcOBVData(spikeAtBar19)
    for (let n = 5; n < spikeAtBar19.length; n++) {
      const partial = calcOBVData(spikeAtBar19.slice(0, n))
      for (let i = 0; i < n; i++) {
        expect(partial[i]).toBe(full[i])
      }
    }
  })
})

describe('calcPVTData', () => {
  it('empty returns empty', () => {
    expect(calcPVTData(empty)).toEqual([])
  })

  it('starts at 0', () => {
    expect(calcPVTData(pureUptrend)[0]).toBe(0)
  })

  it('on constantPrice PVT stays at 0', () => {
    const out = calcPVTData(constantPrice)
    for (const v of out) expect(v).toBe(0)
  })

  it('on pureUptrend PVT monotonically increases', () => {
    const out = calcPVTData(pureUptrend)
    for (let t = 1; t < out.length; t++) {
      expect(out[t]!).toBeGreaterThanOrEqual(out[t - 1]!)
    }
  })

  it('extensional consistency', () => {
    const full = calcPVTData(sideways)
    for (let n = 5; n < sideways.length; n++) {
      const partial = calcPVTData(sideways.slice(0, n))
      for (let i = 0; i < n; i++) {
        expect(partial[i]).toBeCloseTo(full[i]!, 9)
      }
    }
  })
})
