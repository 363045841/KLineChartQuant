import { describe, it, expect } from 'vitest'
import { calcVMAData, calcOBVData, calcPVTData } from '../calculators'
import {
    empty,
    constantPrice,
    pureUptrend,
    pureDowntrend,
    sideways,
    spikeAtBar19,
} from './__fixtures__/synthetic'

describe('calcVMAData', () => {
    it('empty returns empty', () => {
        expect(calcVMAData(empty, 5)).toEqual([])
    })

    it('shorter than period returns all undefined', () => {
        const out = calcVMAData(pureUptrend.slice(0, 3), 5)
        for (const v of out) expect(v).toBeUndefined()
    })

    it('period <= 0 returns all undefined', () => {
        const out = calcVMAData(pureUptrend, 0)
        for (const v of out) expect(v).toBeUndefined()
    })

    it('on constantPrice (volume=1000) VMA = 1000 after warm-up', () => {
        const out = calcVMAData(constantPrice, 5)
        for (let t = 4; t < out.length; t++) {
            expect(out[t]).toBe(1000)
        }
    })

    it('mathematical exactness: VMA = mean of last `period` volumes', () => {
        const period = 5
        const out = calcVMAData(pureUptrend, period)
        for (let t = period - 1; t < out.length; t++) {
            let sum = 0
            for (let k = 0; k < period; k++) sum += pureUptrend[t - k]!.volume
            expect(out[t]!).toBeCloseTo(sum / period, 9)
        }
    })
})

describe('calcOBVData', () => {
    it('empty returns empty', () => {
        expect(calcOBVData(empty)).toEqual([])
    })

    it('starts at 0', () => {
        const out = calcOBVData(pureUptrend)
        expect(out[0]).toBe(0)
    })

    it('on pureUptrend OBV monotonically increases (every Δclose > 0 → +volume)', () => {
        const out = calcOBVData(pureUptrend)
        for (let t = 1; t < out.length; t++) {
            expect(out[t]!).toBeGreaterThanOrEqual(out[t - 1]!)
        }
    })

    it('on pureDowntrend OBV monotonically decreases', () => {
        const out = calcOBVData(pureDowntrend)
        for (let t = 1; t < out.length; t++) {
            expect(out[t]!).toBeLessThanOrEqual(out[t - 1]!)
        }
    })

    it('on constantPrice (no Δclose) OBV stays at 0', () => {
        const out = calcOBVData(constantPrice)
        for (const v of out) expect(v).toBe(0)
    })

    it('extensional consistency on spike fixture', () => {
        const full = calcOBVData(spikeAtBar19)
        for (let n = 5; n < spikeAtBar19.length; n++) {
            const partial = calcOBVData(spikeAtBar19.slice(0, n))
            for (let i = 0; i < n; i++) {
                expect(partial[i]).toBe(full[i])
            }
        }
    })
})

describe('calcPVTData', () => {
    it('empty returns empty', () => {
        expect(calcPVTData(empty)).toEqual([])
    })

    it('starts at 0', () => {
        expect(calcPVTData(pureUptrend)[0]).toBe(0)
    })

    it('on constantPrice PVT stays at 0', () => {
        const out = calcPVTData(constantPrice)
        for (const v of out) expect(v).toBe(0)
    })

    it('on pureUptrend PVT monotonically increases', () => {
        const out = calcPVTData(pureUptrend)
        for (let t = 1; t < out.length; t++) {
            expect(out[t]!).toBeGreaterThanOrEqual(out[t - 1]!)
        }
    })

    it('extensional consistency', () => {
        const full = calcPVTData(sideways)
        for (let n = 5; n < sideways.length; n++) {
            const partial = calcPVTData(sideways.slice(0, n))
            for (let i = 0; i < n; i++) {
                expect(partial[i]).toBeCloseTo(full[i]!, 9)
            }
        }
    })
})
