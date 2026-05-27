type SparseSeries = readonly (number | undefined)[]

export function assertWarmupThenDefined(series: SparseSeries, expectedWarmup: number, label: string): void {
    for (let i = 0; i < expectedWarmup; i++) {
        if (series[i] !== undefined) {
            throw new Error(`${label}: index ${i} should be warm-up (undefined), got ${series[i]}`)
        }
    }
    for (let i = expectedWarmup; i < series.length; i++) {
        if (series[i] === undefined) {
            throw new Error(`${label}: index ${i} should be defined after warm-up, got undefined`)
        }
    }
}

export function assertNonNegative(series: SparseSeries, label: string): void {
    for (let i = 0; i < series.length; i++) {
        const v = series[i]
        if (v !== undefined && v < 0) {
            throw new Error(`${label}: index ${i} should be ≥ 0, got ${v}`)
        }
    }
}

export function assertBounded(
    series: SparseSeries,
    min: number,
    max: number,
    label: string,
): void {
    for (let i = 0; i < series.length; i++) {
        const v = series[i]
        if (v === undefined) continue
        if (v < min || v > max) {
            throw new Error(`${label}: index ${i} value ${v} outside [${min}, ${max}]`)
        }
    }
}

export function assertMonotonicByDirection(
    series: SparseSeries,
    directions: readonly number[],
    label: string,
): void {
    if (series.length !== directions.length) {
        throw new Error(`${label}: series and directions length mismatch (${series.length} vs ${directions.length})`)
    }
    let prev: number | undefined
    for (let i = 0; i < series.length; i++) {
        const v = series[i]
        if (v === undefined) {
            prev = undefined
            continue
        }
        if (prev !== undefined) {
            const expectedDir = directions[i]!
            const actualDir = Math.sign(v - prev)
            if (expectedDir !== 0 && actualDir !== expectedDir && actualDir !== 0) {
                throw new Error(
                    `${label}: at index ${i} expected direction ${expectedDir}, value moved from ${prev} to ${v} (dir=${actualDir})`,
                )
            }
        }
        prev = v
    }
}

export function assertFiniteOrUndefined(series: SparseSeries, label: string): void {
    for (let i = 0; i < series.length; i++) {
        const v = series[i]
        if (v === undefined) continue
        if (!Number.isFinite(v)) {
            throw new Error(`${label}: index ${i} non-finite value ${v}`)
        }
    }
}
