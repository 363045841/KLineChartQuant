import { describe, it, expect } from 'vitest'
import { calcKeltnerData } from '../calculators'
import {
    empty,
    constantPrice,
    pureUptrend,
    sideways,
    spikeAtBar19,
} from './__fixtures__/synthetic'

describe('calcKeltnerData', () => {
    it('empty returns empty', () => {
        expect(calcKeltnerData(empty, 20, 10, 2)).toEqual([])
    })

    it('on constantPrice all bands collapse to 100 (ATR=0 → no band width)', () => {
        const out = calcKeltnerData(constantPrice, 20, 10, 2)
        const valid = out.filter((p) => p !== undefined)
        expect(valid.length).toBeGreaterThan(0)
        for (const p of valid) {
            expect(p!.middle).toBeCloseTo(100, 9)
            expect(p!.upper).toBeCloseTo(100, 9)
            expect(p!.lower).toBeCloseTo(100, 9)
        }
    })

    it('upper >= middle >= lower invariant', () => {
        for (const fx of [pureUptrend, sideways, spikeAtBar19]) {
            const out = calcKeltnerData(fx, 20, 10, 2)
            for (const p of out) {
                if (!p) continue
                expect(p.upper).toBeGreaterThanOrEqual(p.middle)
                expect(p.middle).toBeGreaterThanOrEqual(p.lower)
            }
        }
    })

    it('larger multiplier widens the band', () => {
        const narrow = calcKeltnerData(spikeAtBar19, 20, 10, 1)
        const wide = calcKeltnerData(spikeAtBar19, 20, 10, 4)
        for (let i = 15; i < narrow.length; i++) {
            const n = narrow[i]
            const w = wide[i]
            if (n && w) {
                expect(w.upper - w.lower).toBeGreaterThanOrEqual(n.upper - n.lower)
            }
        }
    })

    it('extensional consistency', () => {
        const full = calcKeltnerData(pureUptrend, 20, 10, 2)
        for (let n = 15; n < pureUptrend.length; n++) {
            const partial = calcKeltnerData(pureUptrend.slice(0, n), 20, 10, 2)
            for (let i = 0; i < n; i++) {
                const f = full[i]
                const p = partial[i]
                if (f && p) {
                    expect(p.middle).toBeCloseTo(f.middle, 9)
                    expect(p.upper).toBeCloseTo(f.upper, 9)
                    expect(p.lower).toBeCloseTo(f.lower, 9)
                }
            }
        }
    })
})
