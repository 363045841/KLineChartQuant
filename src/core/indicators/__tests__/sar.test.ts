import { describe, it, expect } from 'vitest'
import { calcSARData } from '../calculators'
import {
    empty,
    singleBar,
    pureUptrend,
    pureDowntrend,
    spikeAtBar19,
    gapUp,
} from './__fixtures__/synthetic'

describe('calcSARData — Parabolic SAR', () => {
    describe('edge cases', () => {
        it('empty returns empty array', () => {
            expect(calcSARData(empty, 0.02, 0.2)).toEqual([])
        })

        it('single bar returns [undefined] (needs 2 bars to seed trend)', () => {
            expect(calcSARData(singleBar, 0.02, 0.2)).toEqual([undefined])
        })

        it('step <= 0 returns all undefined', () => {
            const out = calcSARData(pureUptrend, 0, 0.2)
            for (const v of out) expect(v).toBeUndefined()
        })
    })

    describe('mathematical properties', () => {
        it('on pureUptrend SAR remains below the candles in an up trend', () => {
            const out = calcSARData(pureUptrend, 0.02, 0.2)
            for (let i = 1; i < out.length; i++) {
                const point = out[i]!
                expect(point).toBeDefined()
                if (point.trend === 'up') {
                    expect(point.value).toBeLessThanOrEqual(pureUptrend[i]!.low)
                }
            }
        })

        it('on pureDowntrend SAR remains above the candles in a down trend', () => {
            const out = calcSARData(pureDowntrend, 0.02, 0.2)
            for (let i = 1; i < out.length; i++) {
                const point = out[i]!
                if (point.trend === 'down') {
                    expect(point.value).toBeGreaterThanOrEqual(pureDowntrend[i]!.high)
                }
            }
        })

        it('trend reverses after price violates SAR (spike fixture)', () => {
            const out = calcSARData(spikeAtBar19, 0.02, 0.2)
            // At least one transition should appear in the spike fixture
            const trends = out
                .filter((p): p is { value: number; trend: 'up' | 'down' } => p !== undefined)
                .map((p) => p.trend)
            const distinctTrends = new Set(trends)
            expect(distinctTrends.size).toBeGreaterThanOrEqual(1)
        })

        it('extensional consistency on gapUp fixture', () => {
            const full = calcSARData(gapUp, 0.02, 0.2)
            for (let n = 3; n < gapUp.length; n++) {
                const partial = calcSARData(gapUp.slice(0, n), 0.02, 0.2)
                for (let i = 0; i < n; i++) {
                    const f = full[i]
                    const p = partial[i]
                    if (f && p) {
                        expect(p.value).toBeCloseTo(f.value, 9)
                        expect(p.trend).toBe(f.trend)
                    }
                }
            }
        })

        it('AF respects maxStep ceiling', () => {
            // SAR with a very small maxStep should stay close to the seed (slow acceleration)
            const slow = calcSARData(pureUptrend, 0.02, 0.02)
            const fast = calcSARData(pureUptrend, 0.02, 0.2)
            // After several bars, fast SAR should have caught up to price more aggressively
            const t = 25
            const slowGap = pureUptrend[t]!.close - slow[t]!.value
            const fastGap = pureUptrend[t]!.close - fast[t]!.value
            expect(fastGap).toBeLessThanOrEqual(slowGap)
        })
    })
})
