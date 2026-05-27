import { describe, it, expect } from 'vitest'
import { calcTRIXData } from '../calculators'
import {
    empty,
    constantPrice,
    pureUptrend,
    pureDowntrend,
    sideways,
} from './__fixtures__/synthetic'

describe('calcTRIXData', () => {
    it('empty returns empty result', () => {
        const out = calcTRIXData(empty, 15, 9)
        expect(out.series).toEqual([])
        expect(out.signalSeries).toEqual([])
    })

    it('period <= 0 returns empty series', () => {
        const out = calcTRIXData(pureUptrend, 0, 9)
        for (const v of out.series) expect(v).toBeUndefined()
    })

    it('on constantPrice TRIX = 0 (constant EMA3 → no change)', () => {
        const out = calcTRIXData(constantPrice, 15, 9)
        for (let t = 1; t < out.series.length; t++) {
            if (out.series[t] !== undefined) expect(out.series[t]).toBeCloseTo(0, 9)
        }
    })

    it('on pureUptrend TRIX > 0 once warmed', () => {
        const out = calcTRIXData(pureUptrend, 5, 3)
        const tail = out.series.slice(10).filter((v): v is number => v !== undefined)
        expect(tail.length).toBeGreaterThan(0)
        for (const v of tail) {
            expect(v).toBeGreaterThan(0)
        }
    })

    it('on pureDowntrend TRIX < 0 once warmed', () => {
        const out = calcTRIXData(pureDowntrend, 5, 3)
        const tail = out.series.slice(10).filter((v): v is number => v !== undefined)
        for (const v of tail) {
            expect(v).toBeLessThan(0)
        }
    })

    it('signal series is a smoothing of TRIX (less volatile)', () => {
        const out = calcTRIXData(sideways, 5, 3)
        // Both should have defined tails; signal range should not exceed series range
        const series = out.series.filter((v): v is number => v !== undefined)
        const signal = out.signalSeries.filter((v): v is number => v !== undefined)
        if (series.length >= 5 && signal.length >= 5) {
            const seriesRange = Math.max(...series) - Math.min(...series)
            const signalRange = Math.max(...signal) - Math.min(...signal)
            expect(signalRange).toBeLessThanOrEqual(seriesRange + 1e-9)
        }
    })

    it('extensional consistency', () => {
        const full = calcTRIXData(pureUptrend, 5, 3)
        for (let n = 10; n < pureUptrend.length; n++) {
            const partial = calcTRIXData(pureUptrend.slice(0, n), 5, 3)
            for (let i = 0; i < n; i++) {
                if (full.series[i] !== undefined && partial.series[i] !== undefined) {
                    expect(partial.series[i]).toBeCloseTo(full.series[i]!, 9)
                }
            }
        }
    })
})
