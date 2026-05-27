import { describe, it, expect } from 'vitest'
import { calcDonchianData } from '../calculators'
import {
    empty,
    constantPrice,
    pureUptrend,
    sideways,
    spikeAtBar19,
} from './__fixtures__/synthetic'

describe('calcDonchianData', () => {
    it('empty returns empty', () => {
        expect(calcDonchianData(empty, 20)).toEqual([])
    })

    it('shorter than period returns all undefined', () => {
        const out = calcDonchianData(constantPrice.slice(0, 5), 20)
        for (const v of out) expect(v).toBeUndefined()
    })

    it('period <= 0 returns all undefined', () => {
        const out = calcDonchianData(pureUptrend, 0)
        for (const v of out) expect(v).toBeUndefined()
    })

    it('on constantPrice (H=L=100) all bands collapse to 100', () => {
        const out = calcDonchianData(constantPrice, 20)
        const valid = out.filter((p) => p !== undefined)
        expect(valid.length).toBeGreaterThan(0)
        for (const p of valid) {
            expect(p!.upper).toBe(100)
            expect(p!.middle).toBe(100)
            expect(p!.lower).toBe(100)
        }
    })

    it('upper >= middle >= lower invariant', () => {
        for (const fx of [pureUptrend, sideways, spikeAtBar19]) {
            const out = calcDonchianData(fx, 20)
            for (const p of out) {
                if (!p) continue
                expect(p.upper).toBeGreaterThanOrEqual(p.middle)
                expect(p.middle).toBeGreaterThanOrEqual(p.lower)
                expect(p.middle).toBeCloseTo((p.upper + p.lower) / 2, 9)
            }
        }
    })

    it('on pureUptrend, upper at index t equals high[t] (newest is always the maximum)', () => {
        const out = calcDonchianData(pureUptrend, 20)
        for (let t = 19; t < out.length; t++) {
            expect(out[t]!.upper).toBe(pureUptrend[t]!.high)
        }
    })

    it('extensional consistency', () => {
        const full = calcDonchianData(pureUptrend, 20)
        for (let n = 20; n < pureUptrend.length; n++) {
            const partial = calcDonchianData(pureUptrend.slice(0, n), 20)
            for (let i = 0; i < n; i++) {
                const f = full[i]
                const p = partial[i]
                if (f && p) {
                    expect(p.upper).toBe(f.upper)
                    expect(p.lower).toBe(f.lower)
                }
            }
        }
    })
})
