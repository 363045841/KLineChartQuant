import atrGolden from './atr.json'

export interface GoldenSeries {
    period: number
    series: (number | null)[]
}

export type GoldenFixture = Record<string, GoldenSeries>

export const ATR_GOLDEN: GoldenFixture = filterMeta(atrGolden as Record<string, unknown>)

function filterMeta(raw: Record<string, unknown>): GoldenFixture {
    const out: GoldenFixture = {}
    for (const [key, value] of Object.entries(raw)) {
        if (key.startsWith('$')) continue
        out[key] = value as GoldenSeries
    }
    return out
}

export function assertSeriesClose(
    actual: readonly (number | undefined)[],
    expected: readonly (number | null)[],
    tolerance = 1e-9,
): void {
    if (actual.length !== expected.length) {
        throw new Error(`series length mismatch: actual=${actual.length} expected=${expected.length}`)
    }
    for (let i = 0; i < expected.length; i++) {
        const a = actual[i]
        const e = expected[i]
        if (e === null) {
            if (a !== undefined) {
                throw new Error(`at index ${i}: expected undefined (warm-up), got ${a}`)
            }
            continue
        }
        if (a === undefined) {
            throw new Error(`at index ${i}: expected ${e}, got undefined`)
        }
        if (Math.abs(a - e) > tolerance) {
            throw new Error(`at index ${i}: expected ${e}, got ${a} (Δ=${Math.abs(a - e)})`)
        }
    }
}
