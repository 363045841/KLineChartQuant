import { describe, it, expect } from 'vitest'
import { calcCMFData, calcMFIData } from '../calculators'
import {
    empty,
    constantPrice,
    pureUptrend,
    pureDowntrend,
    sideways,
    spikeAtBar19,
} from './__fixtures__/synthetic'

describe('calcCMFData', () => {
    it('empty returns empty', () => {
        expect(calcCMFData(empty, 20)).toEqual([])
    })

    it('period <= 0 returns all undefined', () => {
        const out = calcCMFData(pureUptrend, 0)
        for (const v of out) expect(v).toBeUndefined()
    })

    it('CMF ∈ [-1, 1] for all defined values', () => {
        for (const fx of [pureUptrend, pureDowntrend, sideways, spikeAtBar19]) {
            for (const v of calcCMFData(fx, 10)) {
                if (v !== undefined) {
                    expect(v).toBeGreaterThanOrEqual(-1)
                    expect(v).toBeLessThanOrEqual(1)
                }
            }
        }
    })

    it('on pureUptrend (close=high+1-1=center) CMF stays near 0', () => {
        // close = 100+i, high = 101+i, low = 99+i → close midway → MFM ≈ 0
        const out = calcCMFData(pureUptrend, 10)
        for (let t = 9; t < out.length; t++) {
            expect(out[t]).toBeCloseTo(0, 9)
        }
    })

    it('extensional consistency', () => {
        const full = calcCMFData(pureUptrend, 10)
        for (let n = 11; n < pureUptrend.length; n++) {
            const partial = calcCMFData(pureUptrend.slice(0, n), 10)
            for (let i = 0; i < n; i++) {
                if (full[i] !== undefined && partial[i] !== undefined) {
                    expect(partial[i]).toBeCloseTo(full[i]!, 9)
                }
            }
        }
    })
})

describe('calcMFIData', () => {
    it('empty returns empty', () => {
        expect(calcMFIData(empty, 14)).toEqual([])
    })

    it('shorter than period+1 returns all undefined', () => {
        const out = calcMFIData(pureUptrend.slice(0, 10), 14)
        for (const v of out) expect(v).toBeUndefined()
    })

    it('MFI ∈ [0, 100] for all defined values', () => {
        for (const fx of [pureUptrend, pureDowntrend, sideways, spikeAtBar19]) {
            for (const v of calcMFIData(fx, 7)) {
                if (v !== undefined) {
                    expect(v).toBeGreaterThanOrEqual(0)
                    expect(v).toBeLessThanOrEqual(100)
                }
            }
        }
    })

    it('on pureUptrend MFI = 100 (all positive money flow, no negative)', () => {
        const out = calcMFIData(pureUptrend, 14)
        for (let t = 14; t < out.length; t++) {
            expect(out[t]).toBe(100)
        }
    })

    it('on pureDowntrend MFI = 0 (all negative money flow)', () => {
        const out = calcMFIData(pureDowntrend, 14)
        for (let t = 14; t < out.length; t++) {
            expect(out[t]).toBe(0)
        }
    })

    it('extensional consistency', () => {
        const full = calcMFIData(sideways, 7)
        for (let n = 10; n < sideways.length; n++) {
            const partial = calcMFIData(sideways.slice(0, n), 7)
            for (let i = 0; i < n; i++) {
                if (full[i] !== undefined && partial[i] !== undefined) {
                    expect(partial[i]).toBeCloseTo(full[i]!, 9)
                }
            }
        }
    })
})
