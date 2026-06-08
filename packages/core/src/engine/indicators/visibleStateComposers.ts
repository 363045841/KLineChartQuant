import type { IndicatorVisibleStateComposer } from './indicatorMetadata'
import type { IndicatorSeriesBundle } from './workerProtocol'

type SparseIndicatorSeries = {
    series: (number | undefined)[]
    params: unknown
}

type SparseState = {
    timestamp: number
    series: (number | undefined)[]
    params: unknown
    valueMin: number
    valueMax: number
    visibleMin: number
    visibleMax: number
}

function getSparseSeriesBundle(bundle: IndicatorSeriesBundle, bundleKey: string): SparseIndicatorSeries {
    return (bundle as unknown as Record<string, SparseIndicatorSeries>)[bundleKey]!
}

function calcSparseExtremes(series: (number | undefined)[], range: { start: number; end: number }): { min: number; max: number } {
    if (series.length === 0 || range.start >= series.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    const end = Math.min(range.end, series.length)
    for (let i = range.start; i < end; i++) {
        const v = series[i]
        if (v !== undefined) {
            min = Math.min(min, v)
            max = Math.max(max, v)
        }
    }
    return { min, max }
}

function computePaddedBounds(
    extremes: { min: number; max: number },
    emptyState: Pick<SparseState, 'valueMin' | 'valueMax'>,
): { valueMin: number; valueMax: number } {
    if (!Number.isFinite(extremes.min) || !Number.isFinite(extremes.max)) {
        return { valueMin: emptyState.valueMin, valueMax: emptyState.valueMax }
    }

    const range = extremes.max - extremes.min
    const padding = range > 0 ? range * 0.05 : Math.max(1, Math.abs(extremes.max) * 0.05)
    return { valueMin: extremes.min - padding, valueMax: extremes.max + padding }
}

export function createSparseVisibleStateComposer(
    bundleKey: string,
    emptyState: SparseState,
): IndicatorVisibleStateComposer {
    return ({ bundle, visibleRange, timestamp, active }) => {
        const source = getSparseSeriesBundle(bundle, bundleKey)
        if (!active) {
            return {
                ...emptyState,
                timestamp,
                series: source.series,
                params: source.params,
            }
        }

        const extremes = calcSparseExtremes(source.series, visibleRange)
        const bounds = computePaddedBounds(extremes, emptyState)
        return {
            timestamp,
            series: source.series,
            params: source.params,
            valueMin: bounds.valueMin,
            valueMax: bounds.valueMax,
            visibleMin: extremes.min,
            visibleMax: extremes.max,
        }
    }
}
