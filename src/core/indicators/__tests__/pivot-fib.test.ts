import { describe, it, expect } from 'vitest'
import { calcPivotData, calcFibData } from '../calculators'
import {
    empty,
    singleBar,
    pureUptrend,
    pureDowntrend,
    sideways,
    spikeAtBar19,
} from './__fixtures__/synthetic'

describe('calcPivotData', () => {
    it('empty returns empty', () => {
        expect(calcPivotData(empty)).toEqual([])
    })

    it('first bar has no pivot (needs prior bar)', () => {
        expect(calcPivotData(pureUptrend)[0]).toBeUndefined()
    })

    it('PP = (prevH + prevL + prevC) / 3', () => {
        const out = calcPivotData(pureUptrend)
        for (let t = 1; t < out.length; t++) {
            const prev = pureUptrend[t - 1]!
            expect(out[t]!.pp).toBeCloseTo((prev.high + prev.low + prev.close) / 3, 9)
        }
    })

    it('R1 > PP > S1 invariant (price-action symmetry)', () => {
        const out = calcPivotData(pureUptrend)
        for (let t = 1; t < out.length; t++) {
            const p = out[t]!
            expect(p.r1).toBeGreaterThan(p.pp)
            expect(p.pp).toBeGreaterThan(p.s1)
        }
    })

    it('R3 > R2 > R1 > PP > S1 > S2 > S3 chain', () => {
        const out = calcPivotData(pureUptrend)
        for (let t = 1; t < out.length; t++) {
            const p = out[t]!
            expect(p.r3).toBeGreaterThanOrEqual(p.r2)
            expect(p.r2).toBeGreaterThanOrEqual(p.r1)
            expect(p.r1).toBeGreaterThanOrEqual(p.pp)
            expect(p.pp).toBeGreaterThanOrEqual(p.s1)
            expect(p.s1).toBeGreaterThanOrEqual(p.s2)
            expect(p.s2).toBeGreaterThanOrEqual(p.s3)
        }
    })

    it('extensional consistency', () => {
        const full = calcPivotData(pureUptrend)
        for (let n = 3; n < pureUptrend.length; n++) {
            const partial = calcPivotData(pureUptrend.slice(0, n))
            for (let i = 0; i < n; i++) {
                if (full[i] && partial[i]) {
                    expect(partial[i]!.pp).toBeCloseTo(full[i]!.pp, 9)
                }
            }
        }
    })
})

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
