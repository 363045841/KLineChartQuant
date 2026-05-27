import { describe, it, expect } from 'vitest'
import { calcVWAPData } from '../calculators'
import {
    empty,
    constantPrice,
    pureUptrend,
    pureDowntrend,
    sideways,
    spikeAtBar19,
} from './__fixtures__/synthetic'

describe('calcVWAPData', () => {
    it('empty returns empty', () => {
        expect(calcVWAPData(empty, 0)).toEqual([])
    })

    it('on constantPrice (TP=100, volume=1000) VWAP = 100 throughout', () => {
        const out = calcVWAPData(constantPrice, 0)
        for (const v of out) expect(v).toBeCloseTo(100, 9)
    })

    it('VWAP between min low and max high of cumulative window', () => {
        for (const fx of [pureUptrend, pureDowntrend, sideways, spikeAtBar19]) {
            const out = calcVWAPData(fx, 0)
            for (let t = 0; t < out.length; t++) {
                const v = out[t]
                if (v === undefined) continue
                let cumLo = Infinity
                let cumHi = -Infinity
                for (let i = 0; i <= t; i++) {
                    if (fx[i]!.low < cumLo) cumLo = fx[i]!.low
                    if (fx[i]!.high > cumHi) cumHi = fx[i]!.high
                }
                expect(v).toBeGreaterThanOrEqual(cumLo - 1e-9)
                expect(v).toBeLessThanOrEqual(cumHi + 1e-9)
            }
        }
    })

    it('on pureUptrend VWAP monotonically increases (each new TP > running average)', () => {
        const out = calcVWAPData(pureUptrend, 0)
        for (let t = 1; t < out.length; t++) {
            expect(out[t]!).toBeGreaterThan(out[t - 1]!)
        }
    })

    it('session reset triggers when gap exceeds threshold', () => {
        // Construct data with a big timestamp gap to trigger reset
        const HOUR_MS = 3_600_000
        const data = pureUptrend.map((bar, i) => ({
            ...bar,
            timestamp: bar.timestamp + (i >= 15 ? 24 * HOUR_MS : 0), // 15-bar gap day-jump
        }))
        const noReset = calcVWAPData(data, 0)
        const withReset = calcVWAPData(data, 12 * HOUR_MS)
        // After reset, VWAP at bar 15+ should be different from no-reset version
        expect(withReset[15]).not.toBeCloseTo(noReset[15]!, 6)
    })

    it('extensional consistency', () => {
        const full = calcVWAPData(pureUptrend, 0)
        for (let n = 5; n < pureUptrend.length; n++) {
            const partial = calcVWAPData(pureUptrend.slice(0, n), 0)
            for (let i = 0; i < n; i++) {
                expect(partial[i]).toBeCloseTo(full[i]!, 9)
            }
        }
    })
})
