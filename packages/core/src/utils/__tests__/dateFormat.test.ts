import { describe, it, expect } from 'vitest'
import { findMonthBoundaries, findDayBoundaries } from '../dateFormat'

function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n))
}

function makeData(timestamps: number[]): Array<{ timestamp: number }> {
    return timestamps.map((ts) => ({ timestamp: ts }))
}

function computeMonthKeys(data: Array<{ timestamp: number } | undefined>): Int32Array {
    const keys = new Int32Array(data.length)
    for (let i = 0; i < data.length; i++) {
        const cur = data[i]
        if (!cur) { keys[i] = 0; continue }
        const d = new Date(cur.timestamp)
        keys[i] = d.getFullYear() * 12 + d.getMonth()
    }
    return keys
}

function computeDayKeys(data: Array<{ timestamp: number } | undefined>): Int32Array {
    const keys = new Int32Array(data.length)
    for (let i = 0; i < data.length; i++) {
        const cur = data[i]
        if (!cur) { keys[i] = 0; continue }
        const d = new Date(cur.timestamp)
        const yearStart = new Date(d.getFullYear(), 0, 0)
        keys[i] = d.getFullYear() * 366 + Math.floor((d.getTime() - yearStart.getTime()) / 86400000)
    }
    return keys
}

describe('findMonthBoundaries', () => {
    it('returns empty for empty data', () => {
        expect(findMonthBoundaries([])).toEqual([])
        expect(findMonthBoundaries([], new Int32Array(0))).toEqual([])
    })

    it('returns [0] for single entry', () => {
        const data = makeData([1735689600000]) // 2025-01-01
        expect(findMonthBoundaries(data)).toEqual([0])
        expect(findMonthBoundaries(data, computeMonthKeys(data))).toEqual([0])
    })

    it('detects month transition', () => {
        const data = makeData([
            1735689600000, // 2025-01-01
            1735776000000, // 2025-01-02
            1738368000000, // 2025-02-01
            1738454400000, // 2025-02-02
        ])
        const expected = [0, 2]
        expect(findMonthBoundaries(data)).toEqual(expected)
        expect(findMonthBoundaries(data, computeMonthKeys(data))).toEqual(expected)
    })

    it('detects year transition', () => {
        const data = makeData([
            1735689600000, // 2025-01-01
            1767225600000, // 2026-01-01
        ])
        const expected = [0, 1]
        expect(findMonthBoundaries(data)).toEqual(expected)
        expect(findMonthBoundaries(data, computeMonthKeys(data))).toEqual(expected)
    })

    it('caches result when Int32Array not provided (same reference)', () => {
        const data = makeData([
            1735689600000,
            1738368000000,
        ])
        const first = findMonthBoundaries(data)
        const second = findMonthBoundaries(data)
        expect(first).toBe(second)
    })

    it('produces identical result with and without Int32Array', () => {
        const data = makeData([
            1735689600000,
            1735776000000,
            1738368000000,
            1740787200000,
            1743465600000,
        ])
        const monthKeys = computeMonthKeys(data)
        expect(findMonthBoundaries(data)).toEqual(findMonthBoundaries(data, monthKeys))
    })

    it('handles sparse data with undefined entries', () => {
        const sparse: Array<{ timestamp: number } | undefined> = [
            { timestamp: 1735689600000 },
            undefined,
            { timestamp: 1738368000000 },
            undefined,
            { timestamp: 1740787200000 },
        ]
        const monthKeys = computeMonthKeys(sparse)
        expect(findMonthBoundaries(sparse)).toEqual([0, 2, 4])
        expect(findMonthBoundaries(sparse, monthKeys)).toEqual([0, 2, 4])
    })
})

describe('findDayBoundaries', () => {
    it('returns empty for empty data', () => {
        expect(findDayBoundaries([])).toEqual([])
        expect(findDayBoundaries([], new Int32Array(0))).toEqual([])
    })

    it('returns [0] for single entry', () => {
        const data = makeData([1735689600000])
        expect(findDayBoundaries(data)).toEqual([0])
        expect(findDayBoundaries(data, computeDayKeys(data))).toEqual([0])
    })

    it('detects day transition', () => {
        const data = makeData([
            1735689600000, // 2025-01-01
            1735776000000, // 2025-01-02
            1735862400000, // 2025-01-03
        ])
        const expected = [0, 1, 2]
        expect(findDayBoundaries(data)).toEqual(expected)
        expect(findDayBoundaries(data, computeDayKeys(data))).toEqual(expected)
    })

    it('detects month boundary within day boundaries', () => {
        const data = makeData([
            1735689600000, // 2025-01-01
            1735776000000, // 2025-01-02
            1738368000000, // 2025-02-01
            1738454400000, // 2025-02-02
        ])
        const expected = [0, 1, 2, 3]
        expect(findDayBoundaries(data)).toEqual(expected)
        expect(findDayBoundaries(data, computeDayKeys(data))).toEqual(expected)
    })

    it('produces identical result with and without Int32Array', () => {
        const data = makeData([
            1735689600000,
            1735776000000,
            1738368000000,
            1738454400000,
            1740787200000,
        ])
        const dayKeys = computeDayKeys(data)
        expect(findDayBoundaries(data)).toEqual(findDayBoundaries(data, dayKeys))
    })

    it('handles sparse data with undefined entries', () => {
        const sparse: Array<{ timestamp: number } | undefined> = [
            { timestamp: 1735689600000 },
            undefined,
            { timestamp: 1735776000000 },
            undefined,
            { timestamp: 1738368000000 },
        ]
        const dayKeys = computeDayKeys(sparse)
        expect(findDayBoundaries(sparse)).toEqual([0, 2, 4])
        expect(findDayBoundaries(sparse, dayKeys)).toEqual([0, 2, 4])
    })
})
