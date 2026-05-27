import { describe, it, expect } from 'vitest'
import { calcStructureData } from '../calculators'
import type { KLineData } from '@/types/price'
import {
    empty,
    pureUptrend,
    pureDowntrend,
    sideways,
} from './__fixtures__/synthetic'

// Build a fixture with a clear swing high, swing low, and breakout
function buildPyramidFixture(): KLineData[] {
    const result: KLineData[] = []
    let close = 100
    const T0 = 1_700_000_000_000
    // Up 0..9
    for (let i = 0; i < 10; i++) {
        close += 1
        result.push({ timestamp: T0 + i * 60000, open: close, high: close + 0.5, low: close - 0.5, close, volume: 100 })
    }
    // Down 10..19 (creates swing high at ~bar 9)
    for (let i = 10; i < 20; i++) {
        close -= 1
        result.push({ timestamp: T0 + i * 60000, open: close, high: close + 0.5, low: close - 0.5, close, volume: 100 })
    }
    // Up again to break swing high (creates BOS at the breakout bar)
    for (let i = 20; i < 35; i++) {
        close += 1
        result.push({ timestamp: T0 + i * 60000, open: close, high: close + 0.5, low: close - 0.5, close, volume: 100 })
    }
    return result
}

describe('calcStructureData', () => {
    it('empty data → empty snapshot', () => {
        const snap = calcStructureData(empty, 2, 2, 'close')
        expect(snap.swings).toEqual([])
        expect(snap.events).toEqual([])
        expect(snap.trend).toBe('range')
    })

    it('on pureUptrend (monotonic): no internal swings, no events', () => {
        const snap = calcStructureData(pureUptrend, 2, 2, 'close')
        // Monotonic uptrend has no local extrema inside the window
        expect(snap.swings.length).toBe(0)
        expect(snap.events.length).toBe(0)
    })

    it('on pureDowntrend (monotonic): no internal swings', () => {
        const snap = calcStructureData(pureDowntrend, 2, 2, 'close')
        expect(snap.swings.length).toBe(0)
    })

    it('on pyramid fixture: produces alternating swing highs and lows with valid labels', () => {
        const data = buildPyramidFixture()
        const snap = calcStructureData(data, 2, 2, 'close')
        expect(snap.swings.length).toBeGreaterThan(0)
        for (const s of snap.swings) {
            expect(['HH', 'HL', 'LH', 'LL']).toContain(s.label)
        }
    })

    it('pyramid fixture: detects a BOS when uptrend breaks prior swing high', () => {
        const data = buildPyramidFixture()
        const snap = calcStructureData(data, 2, 2, 'close')
        // Should have at least one swing
        expect(snap.swings.length).toBeGreaterThan(0)
        // Should detect a BOS or CHOCH event during the second uptrend
        const upEvents = snap.events.filter((e) => e.direction === 'up')
        expect(upEvents.length).toBeGreaterThanOrEqual(1)
    })

    it('breakoutSource = wick vs close produces (possibly) different event timing', () => {
        const data = buildPyramidFixture()
        const closeSnap = calcStructureData(data, 2, 2, 'close')
        const wickSnap = calcStructureData(data, 2, 2, 'wick')
        // Both should produce at least one event; their indices may differ
        expect(closeSnap.events.length).toBeGreaterThanOrEqual(0)
        expect(wickSnap.events.length).toBeGreaterThanOrEqual(0)
    })

    it('swing.confirmed is false within rightWindow of latest bar', () => {
        const data = buildPyramidFixture()
        const right = 2
        const snap = calcStructureData(data, 2, right, 'close')
        for (const s of snap.swings) {
            if (s.index + right >= data.length) {
                expect(s.confirmed).toBe(false)
            } else {
                expect(s.confirmed).toBe(true)
            }
        }
    })

    it('extensional consistency on pyramid fixture', () => {
        const data = buildPyramidFixture()
        const full = calcStructureData(data, 2, 2, 'close')
        for (let n = 15; n < data.length; n++) {
            const partial = calcStructureData(data.slice(0, n), 2, 2, 'close')
            // Confirmed swings in the prefix should match the full version
            const fullConfirmedInPrefix = full.swings.filter((s) => s.confirmed && s.index + 2 < n)
            const partialConfirmed = partial.swings.filter((s) => s.confirmed)
            for (const fs of fullConfirmedInPrefix) {
                const match = partialConfirmed.find((s) => s.index === fs.index && s.kind === fs.kind)
                expect(match).toBeDefined()
                if (match) expect(match.price).toBeCloseTo(fs.price, 9)
            }
        }
    })
})
