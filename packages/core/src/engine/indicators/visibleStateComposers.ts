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

type RecordIndicatorSeries = {
    series: Record<number, (number | undefined)[]>
    enabledPeriods: number[]
    params: unknown
}

type PointIndicatorSeries<T extends Record<string, number>> = {
    series: T
    params: unknown
}

function getRecordSeriesBundle(
    bundle: IndicatorSeriesBundle,
    bundleKey: string,
): RecordIndicatorSeries {
    return (bundle as unknown as Record<string, RecordIndicatorSeries>)[bundleKey]!
}

function getPointSeriesBundle<T extends Record<string, number>>(
    bundle: IndicatorSeriesBundle,
    bundleKey: string,
): PointIndicatorSeries<T> {
    return (bundle as unknown as Record<string, PointIndicatorSeries<T>>)[bundleKey]!
}

function calcRecordExtremes(
    series: Record<number, (number | undefined)[]>,
    range: { start: number; end: number },
): { min: number; max: number } {
    let min = Infinity
    let max = -Infinity
    for (const key of Object.keys(series)) {
        const arr = series[Number(key)]
        if (!arr) continue
        const end = Math.min(range.end, arr.length)
        for (let i = range.start; i < end; i++) {
            const v = arr[i]
            if (v !== undefined) {
                min = Math.min(min, v)
                max = Math.max(max, v)
            }
        }
    }
    return { min, max }
}

function calcPointExtremes<T extends Record<string, number>>(
    series: T,
    fields: readonly (keyof T)[],
): { min: number; max: number } {
    let min = Infinity
    let max = -Infinity
    for (const field of fields) {
        const v = series[field]
        if (v !== undefined && Number.isFinite(v)) {
            min = Math.min(min, v as number)
            max = Math.max(max, v as number)
        }
    }
    return { min, max }
}

export function createFixedRangeSparseVisibleStateComposer(
    bundleKey: string,
    emptyState: {
        timestamp: number
        series: (number | undefined)[]
        params: unknown
        valueMin: number
        valueMax: number
        visibleMin: number
        visibleMax: number
    },
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
        return {
            timestamp,
            series: source.series,
            params: source.params,
            valueMin: emptyState.valueMin,
            valueMax: emptyState.valueMax,
            visibleMin: extremes.min,
            visibleMax: extremes.max,
        }
    }
}

export function createFixedRangeRecordVisibleStateComposer(
    bundleKey: string,
    emptyState: {
        timestamp: number
        series: Record<number, (number | undefined)[]>
        enabledPeriods: number[]
        params: unknown
        valueMin: number
        valueMax: number
        visibleMin: number
        visibleMax: number
    },
): IndicatorVisibleStateComposer {
    return ({ bundle, visibleRange, timestamp, active }) => {
        const source = getRecordSeriesBundle(bundle, bundleKey)
        if (!active) {
            return {
                ...emptyState,
                timestamp,
                series: source.series,
                enabledPeriods: source.enabledPeriods,
                params: source.params,
            }
        }

        const extremes = calcRecordExtremes(source.series, visibleRange)
        return {
            timestamp,
            series: source.series,
            enabledPeriods: source.enabledPeriods,
            params: source.params,
            valueMin: emptyState.valueMin,
            valueMax: emptyState.valueMax,
            visibleMin: extremes.min,
            visibleMax: extremes.max,
        }
    }
}

export function createFixedRangePointVisibleStateComposer<T extends Record<string, number>>(
    bundleKey: string,
    emptyState: {
        timestamp: number
        series: T
        params: unknown
        valueMin: number
        valueMax: number
        visibleMin: number
        visibleMax: number
    },
    fields: readonly (keyof T)[],
): IndicatorVisibleStateComposer {
    return ({ bundle, visibleRange: _visibleRange, timestamp, active }) => {
        const source = getPointSeriesBundle<T>(bundle, bundleKey)
        if (!active) {
            return {
                ...emptyState,
                timestamp,
                series: source.series,
                params: source.params,
            }
        }

        const extremes = calcPointExtremes(source.series, fields)
        return {
            timestamp,
            series: source.series,
            params: source.params,
            valueMin: emptyState.valueMin,
            valueMax: emptyState.valueMax,
            visibleMin: extremes.min,
            visibleMax: extremes.max,
        }
    }
}
