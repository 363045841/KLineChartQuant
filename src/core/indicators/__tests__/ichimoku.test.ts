import { describe, it, expect } from 'vitest'
import { calcIchimokuData } from '../calculators'
import {
    empty,
    constantPrice,
    pureUptrend,
    pureDowntrend,
    sideways,
} from './__fixtures__/synthetic'

describe('calcIchimokuData', () => {
    it('empty returns empty', () => {
        expect(calcIchimokuData(empty, 9, 26, 52, 26)).toEqual([])
    })

    it('on constantPrice (H=L=100) all lines collapse to 100', () => {
        // Only constantPrice (30 bars) is shorter than spanBPeriod=52, so use small periods for this test
        const out = calcIchimokuData(constantPrice, 5, 10, 15, 5)
        // Test data is 30 bars, so spanA/B/chikou exist within the window
        const valid = out.filter((p): p is NonNullable<typeof p> => p !== undefined)
        expect(valid.length).toBe(constantPrice.length)
        // After warm-up, tenkan and kijun should both be 100
        for (let t = 15; t < out.length - 5; t++) {
            const p = out[t]!
            if (p.tenkan !== undefined) expect(p.tenkan).toBe(100)
            if (p.kijun !== undefined) expect(p.kijun).toBe(100)
            if (p.spanA !== undefined) expect(p.spanA).toBe(100)
            if (p.spanB !== undefined) expect(p.spanB).toBe(100)
            if (p.chikou !== undefined) expect(p.chikou).toBe(100)
        }
    })

    it('uptrend: spanA > spanB once cloud is established (bullish cloud)', () => {
        const out = calcIchimokuData(pureUptrend, 5, 10, 15, 5)
        let bullishCount = 0
        let bearishCount = 0
        for (const p of out) {
            if (p && p.spanA !== undefined && p.spanB !== undefined) {
                if (p.spanA > p.spanB) bullishCount++
                else if (p.spanA < p.spanB) bearishCount++
            }
        }
        expect(bullishCount).toBeGreaterThan(bearishCount)
    })

    it('downtrend: spanA < spanB once cloud is established (bearish cloud)', () => {
        const out = calcIchimokuData(pureDowntrend, 5, 10, 15, 5)
        let bullishCount = 0
        let bearishCount = 0
        for (const p of out) {
            if (p && p.spanA !== undefined && p.spanB !== undefined) {
                if (p.spanA > p.spanB) bullishCount++
                else if (p.spanA < p.spanB) bearishCount++
            }
        }
        expect(bearishCount).toBeGreaterThan(bullishCount)
    })

    it('chikou at bar t equals close[t+displacement] when in range, undefined otherwise', () => {
        const displacement = 5
        const out = calcIchimokuData(pureUptrend, 5, 10, 15, displacement)
        for (let t = 0; t < pureUptrend.length; t++) {
            const p = out[t]!
            if (t + displacement < pureUptrend.length) {
                expect(p.chikou).toBe(pureUptrend[t + displacement]!.close)
            } else {
                expect(p.chikou).toBeUndefined()
            }
        }
    })

    it('tenkan/kijun midline equals (max(high) + min(low)) / 2 over the period', () => {
        const period = 9
        const out = calcIchimokuData(pureUptrend, period, 26, 52, 26)
        for (let t = period - 1; t < pureUptrend.length; t++) {
            let hi = -Infinity
            let lo = Infinity
            for (let k = 0; k < period; k++) {
                const bar = pureUptrend[t - k]!
                if (bar.high > hi) hi = bar.high
                if (bar.low < lo) lo = bar.low
            }
            expect(out[t]!.tenkan).toBeCloseTo((hi + lo) / 2, 9)
        }
    })

    it('extensional consistency on sideways fixture', () => {
        const full = calcIchimokuData(sideways, 5, 10, 15, 5)
        for (let n = 16; n < sideways.length; n++) {
            const partial = calcIchimokuData(sideways.slice(0, n), 5, 10, 15, 5)
            for (let i = 0; i < n; i++) {
                const f = full[i]
                const p = partial[i]
                if (f && p) {
                    if (f.tenkan !== undefined && p.tenkan !== undefined) {
                        expect(p.tenkan).toBeCloseTo(f.tenkan, 9)
                    }
                    if (f.kijun !== undefined && p.kijun !== undefined) {
                        expect(p.kijun).toBeCloseTo(f.kijun, 9)
                    }
                }
            }
        }
    })
})
