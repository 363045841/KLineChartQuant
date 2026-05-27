import { describe, it, expect } from 'vitest'
import { calcVolumeProfileData } from '../calculators'
import {
    empty,
    constantPrice,
    pureUptrend,
    sideways,
    spikeAtBar19,
} from './__fixtures__/synthetic'

describe('calcVolumeProfileData', () => {
    it('empty returns empty profile', () => {
        const result = calcVolumeProfileData(empty, 24, 0, 0.7)
        expect(result.bins).toEqual([])
        expect(result.totalVolume).toBe(0)
    })

    it('bins <= 0 returns empty', () => {
        const result = calcVolumeProfileData(pureUptrend, 0, 0, 0.7)
        expect(result.bins).toEqual([])
    })

    it('on constantPrice (H=L=100): degenerate range → empty bins (no meaningful distribution)', () => {
        const result = calcVolumeProfileData(constantPrice, 10, 0, 0.7)
        // When priceMax === priceMin, the binning has no range; the function returns empty bins
        expect(result.bins).toEqual([])
        expect(result.totalVolume).toBe(0)
    })

    it('on pureUptrend: total volume = sum of bar volumes', () => {
        const result = calcVolumeProfileData(pureUptrend, 24, 0, 0.7)
        let expectedTotal = 0
        for (const bar of pureUptrend) expectedTotal += bar.volume
        expect(result.totalVolume).toBeCloseTo(expectedTotal, 6)
    })

    it('POC is within [val, vah] (value area contains POC)', () => {
        for (const fx of [pureUptrend, sideways, spikeAtBar19]) {
            const result = calcVolumeProfileData(fx, 20, 0, 0.7)
            if (result.bins.length === 0) continue
            expect(result.poc).toBeGreaterThanOrEqual(result.val)
            expect(result.poc).toBeLessThanOrEqual(result.vah)
        }
    })

    it('VAH >= VAL invariant', () => {
        for (const fx of [pureUptrend, sideways, spikeAtBar19]) {
            const result = calcVolumeProfileData(fx, 20, 0, 0.7)
            expect(result.vah).toBeGreaterThanOrEqual(result.val)
        }
    })

    it('value area sums to >= valueAreaPercent of total volume', () => {
        const result = calcVolumeProfileData(pureUptrend, 20, 0, 0.7)
        const vaVolume = result.bins
            .filter((b) => b.priceLow >= result.val - 1e-9 && b.priceHigh <= result.vah + 1e-9)
            .reduce((a, b) => a + b.volume, 0)
        expect(vaVolume).toBeGreaterThanOrEqual(result.totalVolume * 0.7 - 1e-6)
    })

    it('bins cover [priceMin, priceMax] contiguously', () => {
        const result = calcVolumeProfileData(pureUptrend, 20, 0, 0.7)
        for (let i = 1; i < result.bins.length; i++) {
            expect(result.bins[i]!.priceLow).toBeCloseTo(result.bins[i - 1]!.priceHigh, 9)
        }
    })

    it('lookback limits the data window', () => {
        const full = calcVolumeProfileData(pureUptrend, 20, 0, 0.7)
        const last10 = calcVolumeProfileData(pureUptrend, 20, 10, 0.7)
        // Lookback should use less data → lower total volume
        expect(last10.totalVolume).toBeLessThan(full.totalVolume)
    })
})
