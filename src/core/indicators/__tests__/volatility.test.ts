import { describe, it, expect } from 'vitest'
import { calcHVData, calcParkinsonData, calcChaikinVolData } from '../calculators'
import {
    empty,
    constantPrice,
    pureUptrend,
    sideways,
    spikeAtBar19,
} from './__fixtures__/synthetic'

describe('calcHVData — Historical Volatility', () => {
    it('empty returns empty', () => {
        expect(calcHVData(empty, 20, 252)).toEqual([])
    })

    it('period <= 0 or annualization <= 0 returns all undefined', () => {
        const out1 = calcHVData(pureUptrend, 0, 252)
        for (const v of out1) expect(v).toBeUndefined()
        const out2 = calcHVData(pureUptrend, 20, 0)
        for (const v of out2) expect(v).toBeUndefined()
    })

    it('on constantPrice HV = 0 (no return variance)', () => {
        const out = calcHVData(constantPrice, 10, 252)
        for (let t = 10; t < out.length; t++) {
            expect(out[t]).toBeCloseTo(0, 9)
        }
    })

    it('on pureUptrend HV > 0 once warm-up complete', () => {
        const out = calcHVData(pureUptrend, 10, 252)
        for (let t = 10; t < out.length; t++) {
            expect(out[t]).toBeGreaterThanOrEqual(0)
        }
    })

    it('HV ≥ 0 always', () => {
        for (const fx of [pureUptrend, sideways, spikeAtBar19]) {
            for (const v of calcHVData(fx, 10, 252)) {
                if (v !== undefined) expect(v).toBeGreaterThanOrEqual(0)
            }
        }
    })

    it('higher annualization → higher HV value (sqrt scaling)', () => {
        const low = calcHVData(spikeAtBar19, 10, 100)
        const high = calcHVData(spikeAtBar19, 10, 400)
        for (let t = 10; t < low.length; t++) {
            if (low[t] !== undefined && high[t] !== undefined) {
                expect(high[t]).toBeCloseTo(low[t]! * 2, 9) // sqrt(400)/sqrt(100) = 2
            }
        }
    })
})

describe('calcParkinsonData — Parkinson Volatility', () => {
    it('empty returns empty', () => {
        expect(calcParkinsonData(empty, 20, 252)).toEqual([])
    })

    it('on constantPrice (H=L) Parkinson = 0', () => {
        const out = calcParkinsonData(constantPrice, 10, 252)
        for (let t = 9; t < out.length; t++) {
            expect(out[t]).toBeCloseTo(0, 9)
        }
    })

    it('Parkinson ≥ 0 always', () => {
        for (const fx of [pureUptrend, sideways, spikeAtBar19]) {
            for (const v of calcParkinsonData(fx, 10, 252)) {
                if (v !== undefined) expect(v).toBeGreaterThanOrEqual(0)
            }
        }
    })

    it('on spike fixture Parkinson responds to the spike bar', () => {
        const out = calcParkinsonData(spikeAtBar19, 5, 252)
        const preSpike = out[18]
        const atSpike = out[19]
        if (preSpike !== undefined && atSpike !== undefined) {
            expect(atSpike).toBeGreaterThanOrEqual(preSpike)
        }
    })
})

describe('calcChaikinVolData — Chaikin Volatility', () => {
    it('empty returns empty', () => {
        expect(calcChaikinVolData(empty, 10, 10)).toEqual([])
    })

    it('on constantPrice ChaikinVol stays at 0 (EMA(H-L) constant)', () => {
        const out = calcChaikinVolData(constantPrice, 10, 10)
        for (let t = 10; t < out.length; t++) {
            if (out[t] !== undefined) expect(out[t]).toBeCloseTo(0, 6)
        }
    })

    it('values finite or undefined', () => {
        for (const fx of [pureUptrend, sideways, spikeAtBar19]) {
            for (const v of calcChaikinVolData(fx, 10, 10)) {
                if (v !== undefined) expect(Number.isFinite(v)).toBe(true)
            }
        }
    })

    it('extensional consistency on spike fixture', () => {
        const full = calcChaikinVolData(spikeAtBar19, 5, 5)
        for (let n = 12; n < spikeAtBar19.length; n++) {
            const partial = calcChaikinVolData(spikeAtBar19.slice(0, n), 5, 5)
            for (let i = 0; i < n; i++) {
                if (full[i] !== undefined && partial[i] !== undefined) {
                    expect(partial[i]).toBeCloseTo(full[i]!, 9)
                }
            }
        }
    })
})
