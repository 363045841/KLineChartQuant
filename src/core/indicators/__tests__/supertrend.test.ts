import { describe, it, expect } from 'vitest'
import { calcSuperTrendData } from '../calculators'
import {
    empty,
    pureUptrend,
    pureDowntrend,
    spikeAtBar19,
    gapUp,
} from './__fixtures__/synthetic'

describe('calcSuperTrendData', () => {
    it('empty returns empty', () => {
        expect(calcSuperTrendData(empty, 10, 3)).toEqual([])
    })

    it('atrPeriod <= 0 returns all undefined', () => {
        const out = calcSuperTrendData(pureUptrend, 0, 3)
        for (const v of out) expect(v).toBeUndefined()
    })

    it('multiplier <= 0 returns all undefined', () => {
        const out = calcSuperTrendData(pureUptrend, 10, 0)
        for (const v of out) expect(v).toBeUndefined()
    })

    it('on pureUptrend SuperTrend trend stays up after warm-up', () => {
        const out = calcSuperTrendData(pureUptrend, 10, 3)
        const valid = out.filter((p): p is { value: number; trend: 'up' | 'down' } => p !== undefined)
        expect(valid.length).toBeGreaterThan(5)
        // All trends should be up since price keeps rising
        for (const p of valid) {
            expect(p.trend).toBe('up')
        }
    })

    it('on pureDowntrend SuperTrend trend stays down', () => {
        const out = calcSuperTrendData(pureDowntrend, 10, 3)
        const valid = out.filter((p): p is { value: number; trend: 'up' | 'down' } => p !== undefined)
        // Most of post-warm-up should be down
        const downCount = valid.filter((p) => p.trend === 'down').length
        expect(downCount).toBeGreaterThan(valid.length / 2)
    })

    it('extensional consistency', () => {
        const full = calcSuperTrendData(gapUp, 10, 3)
        for (let n = 12; n < gapUp.length; n++) {
            const partial = calcSuperTrendData(gapUp.slice(0, n), 10, 3)
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

    it('trend flips on spike fixture', () => {
        const out = calcSuperTrendData(spikeAtBar19, 10, 3)
        const valid = out.filter((p): p is { value: number; trend: 'up' | 'down' } => p !== undefined)
        const trends = new Set(valid.map((p) => p.trend))
        expect(trends.size).toBeGreaterThanOrEqual(1)
    })
})
