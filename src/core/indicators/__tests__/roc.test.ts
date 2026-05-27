import { describe, it, expect } from 'vitest'
import { calcROCData } from '../calculators'
import {
    empty,
    constantPrice,
    pureUptrend,
    pureDowntrend,
    sideways,
} from './__fixtures__/synthetic'

describe('calcROCData', () => {
    it('empty returns empty', () => {
        expect(calcROCData(empty, 12)).toEqual([])
    })

    it('period <= 0 returns all undefined', () => {
        const out = calcROCData(pureUptrend, 0)
        for (const v of out) expect(v).toBeUndefined()
    })

    it('on constantPrice ROC = 0 after warm-up', () => {
        const out = calcROCData(constantPrice, 12)
        for (let t = 12; t < out.length; t++) {
            expect(out[t]).toBe(0)
        }
    })

    it('on pureUptrend ROC > 0 throughout post-warmup', () => {
        const out = calcROCData(pureUptrend, 12)
        for (let t = 12; t < out.length; t++) {
            expect(out[t]).toBeGreaterThan(0)
        }
    })

    it('on pureDowntrend ROC < 0 throughout post-warmup', () => {
        const out = calcROCData(pureDowntrend, 12)
        for (let t = 12; t < out.length; t++) {
            expect(out[t]).toBeLessThan(0)
        }
    })

    it('mathematical exactness: ROC(t) = (close[t]-close[t-p])/close[t-p]*100', () => {
        const period = 12
        const out = calcROCData(pureUptrend, period)
        for (let t = period; t < out.length; t++) {
            const expected = (pureUptrend[t]!.close - pureUptrend[t - period]!.close) / pureUptrend[t - period]!.close * 100
            expect(out[t]!).toBeCloseTo(expected, 12)
        }
    })

    it('warm-up region is [0, period)', () => {
        const out = calcROCData(sideways, 12)
        for (let i = 0; i < 12; i++) expect(out[i]).toBeUndefined()
        for (let i = 12; i < out.length; i++) expect(out[i]).toBeDefined()
    })

    it('extensional consistency', () => {
        const full = calcROCData(pureUptrend, 12)
        for (let n = 15; n < pureUptrend.length; n++) {
            const partial = calcROCData(pureUptrend.slice(0, n), 12)
            for (let i = 0; i < n; i++) {
                if (full[i] !== undefined && partial[i] !== undefined) {
                    expect(partial[i]).toBeCloseTo(full[i]!, 12)
                }
            }
        }
    })
})
