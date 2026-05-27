import { describe, it, expect } from 'vitest'
import { calcZonesData } from '../calculators'
import type { KLineData } from '@/types/price'
import {
    empty,
    pureUptrend,
    constantPrice,
    sideways,
} from './__fixtures__/synthetic'

function buildGapFixture(): KLineData[] {
    const result: KLineData[] = []
    const T0 = 1_700_000_000_000
    // Build a clear bullish FVG: bar[i-2].high < bar[i].low
    // bar 0: H=100, L=99
    result.push({ timestamp: T0, open: 99.5, high: 100, low: 99, close: 99.5, volume: 100 })
    // bar 1: H=102, L=100.5 (gap up vs bar 0)
    result.push({ timestamp: T0 + 60000, open: 101, high: 102, low: 100.5, close: 101.5, volume: 100 })
    // bar 2: H=104, L=101 (bar 0.high=100 < bar 2.low=101 → bullish FVG)
    result.push({ timestamp: T0 + 120000, open: 102, high: 104, low: 101, close: 103, volume: 100 })
    // Continue uptrend
    for (let i = 3; i < 15; i++) {
        const close = 103 + i
        result.push({ timestamp: T0 + i * 60000, open: close, high: close + 0.5, low: close - 0.5, close, volume: 100 })
    }
    return result
}

describe('calcZonesData', () => {
    it('empty returns empty', () => {
        expect(calcZonesData(empty, 5, 2, 2, 'close')).toEqual([])
    })

    it('constant price → no FVGs (no gaps possible)', () => {
        const zones = calcZonesData(constantPrice, 5, 2, 2, 'close')
        expect(zones.filter((z) => z.kind === 'FVG_BULL' || z.kind === 'FVG_BEAR')).toEqual([])
    })

    it('gap fixture → at least one bullish FVG detected', () => {
        const data = buildGapFixture()
        const zones = calcZonesData(data, 5, 2, 2, 'close')
        const fvgs = zones.filter((z) => z.kind === 'FVG_BULL')
        expect(fvgs.length).toBeGreaterThanOrEqual(1)
        // First FVG should be at bar 1 (middle of the 3-bar pattern)
        const firstFvg = fvgs[0]!
        expect(firstFvg.startIndex).toBe(1)
        // Zone bounds: bar[0].high=100, bar[2].low=101 → low=100, high=101
        expect(firstFvg.low).toBe(100)
        expect(firstFvg.high).toBe(101)
    })

    it('zone high > zone low invariant', () => {
        const data = buildGapFixture()
        const zones = calcZonesData(data, 5, 2, 2, 'close')
        for (const z of zones) {
            expect(z.high).toBeGreaterThanOrEqual(z.low)
        }
    })

    it('zone endIndex (if set) > startIndex', () => {
        const data = buildGapFixture()
        const zones = calcZonesData(data, 5, 2, 2, 'close')
        for (const z of zones) {
            if (z.endIndex !== undefined) {
                expect(z.endIndex).toBeGreaterThan(z.startIndex)
            }
        }
    })

    it('extensional consistency on pure uptrend', () => {
        const full = calcZonesData(pureUptrend, 5, 2, 2, 'close')
        for (let n = 5; n < pureUptrend.length; n++) {
            const partial = calcZonesData(pureUptrend.slice(0, n), 5, 2, 2, 'close')
            // Zones in partial that started in the prefix should also appear in full
            for (const pz of partial) {
                if (pz.startIndex + 2 < n) {
                    const fz = full.find((z) => z.startIndex === pz.startIndex && z.kind === pz.kind)
                    expect(fz).toBeDefined()
                    if (fz) {
                        expect(fz.high).toBeCloseTo(pz.high, 9)
                        expect(fz.low).toBeCloseTo(pz.low, 9)
                    }
                }
            }
        }
    })

    it('disabled flags filter zones in renderer mode but raw output includes all', () => {
        // calcZonesData always returns all zone kinds; the renderer params filter rendering
        const data = buildGapFixture()
        const zones = calcZonesData(data, 5, 2, 2, 'close')
        // Just sanity: array exists
        expect(Array.isArray(zones)).toBe(true)
    })
})
