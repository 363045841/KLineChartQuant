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

function getRecordSeriesBundle(
    bundle: IndicatorSeriesBundle,
    bundleKey: string,
): RecordIndicatorSeries {
    return (bundle as unknown as Record<string, RecordIndicatorSeries>)[bundleKey]!
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

export function createFixedRangePointVisibleStateComposer<T extends object>(
    bundleKey: string,
    emptyState: {
        timestamp: number
        series: (T | undefined)[]
        params: unknown
        valueMin: number
        valueMax: number
        visibleMin: number
        visibleMax: number
    },
    fields: readonly (keyof T)[],
): IndicatorVisibleStateComposer {
    return ({ bundle, visibleRange, timestamp, active }) => {
        const source = getPointArraySeriesBundle<T>(bundle, bundleKey)
        if (!active) {
            return {
                ...emptyState,
                timestamp,
                series: source.series,
                params: source.params,
            }
        }

        const extremes = calcPointArrayExtremes(source.series, fields, visibleRange)
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

type DualSparseIndicatorSeries = {
    series: (number | undefined)[]
    signalSeries: (number | undefined)[]
    params: unknown
}

function getDualSparseSeriesBundle(
    bundle: IndicatorSeriesBundle,
    bundleKey: string,
): DualSparseIndicatorSeries {
    return (bundle as unknown as Record<string, DualSparseIndicatorSeries>)[bundleKey]!
}

function getPointArraySeriesBundle<T extends object>(
    bundle: IndicatorSeriesBundle,
    bundleKey: string,
): { series: (T | undefined)[]; params: unknown } {
    return (bundle as unknown as Record<string, { series: (T | undefined)[]; params: unknown }>)[bundleKey]!
}

function calcPointArrayExtremes<T extends object>(
    series: (T | undefined)[],
    fields: readonly (keyof T)[],
    range: { start: number; end: number },
): { min: number; max: number } {
    if (series.length === 0 || range.start >= series.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    const end = Math.min(range.end, series.length)
    for (let i = range.start; i < end; i++) {
        const p = series[i]
        if (p) {
            for (const field of fields) {
                const v = p[field]
                if (typeof v === 'number' && Number.isFinite(v)) {
                    min = Math.min(min, v)
                    max = Math.max(max, v)
                }
            }
        }
    }
    return { min, max }
}

function computeMAFamilyBounds(
    extremes: { min: number; max: number } | null,
    emptyBounds: { valueMin: number; valueMax: number },
): { valueMin: number; valueMax: number } {
    if (!extremes || !Number.isFinite(extremes.min) || !Number.isFinite(extremes.max)) {
        return { valueMin: emptyBounds.valueMin, valueMax: emptyBounds.valueMax }
    }
    const range = extremes.max - extremes.min
    const padding = range > 0 ? range * 0.05 : Math.max(1, Math.abs(extremes.max) * 0.05)
    return { valueMin: extremes.min - padding, valueMax: extremes.max + padding }
}

export function createPaddedSparseVisibleStateComposer(
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
        const padding = Number.isFinite(extremes.max) && Number.isFinite(extremes.min)
            ? Math.max(Math.abs(extremes.max), Math.abs(extremes.min)) * 0.1
            : 0
        return {
            timestamp,
            series: source.series,
            params: source.params,
            valueMin: Number.isFinite(extremes.min) ? extremes.min - padding : emptyState.valueMin,
            valueMax: Number.isFinite(extremes.max) ? extremes.max + padding : emptyState.valueMax,
            visibleMin: extremes.min,
            visibleMax: extremes.max,
        }
    }
}

export function createPaddedPointVisibleStateComposer<T extends object>(
    bundleKey: string,
    emptyState: {
        timestamp: number
        series: (T | undefined)[]
        params: unknown
        valueMin: number
        valueMax: number
        visibleMin: number
        visibleMax: number
    },
    fields: readonly (keyof T)[],
): IndicatorVisibleStateComposer {
    return ({ bundle, visibleRange, timestamp, active }) => {
        const source = getPointArraySeriesBundle<T>(bundle, bundleKey)
        if (!active) {
            return {
                ...emptyState,
                timestamp,
                series: source.series,
                params: source.params,
            }
        }

        const extremes = calcPointArrayExtremes(source.series, fields, visibleRange)
        const range = extremes.max - extremes.min
        const padding = range > 0 ? range * 0.1 : 0
        return {
            timestamp,
            series: source.series,
            params: source.params,
            valueMin: Number.isFinite(extremes.min) ? extremes.min - padding : emptyState.valueMin,
            valueMax: Number.isFinite(extremes.max) ? extremes.max + padding : emptyState.valueMax,
            visibleMin: extremes.min,
            visibleMax: extremes.max,
        }
    }
}

export function createNonNegativeSparseVisibleStateComposer(
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
        const valueMax = Number.isFinite(extremes.max) ? extremes.max * 1.1 : emptyState.valueMax
        return {
            timestamp,
            series: source.series,
            params: source.params,
            valueMin: 0,
            valueMax,
            visibleMin: extremes.min,
            visibleMax: extremes.max,
        }
    }
}

export function createMACDVisibleStateComposer(
    bundleKey: string,
    emptyState: {
        timestamp: number
        series: { dif: number; dea: number; macd: number }[]
        params: unknown
        valueMin: number
        valueMax: number
        visibleMin: number
        visibleMax: number
    },
): IndicatorVisibleStateComposer {
    return ({ bundle, visibleRange, timestamp, active }) => {
        const source = getPointArraySeriesBundle<{ dif: number; dea: number; macd: number }>(bundle, bundleKey)
        if (!active) {
            return {
                ...emptyState,
                timestamp,
                series: source.series,
                params: source.params,
            }
        }

        const extremes = calcPointArrayExtremes(source.series, ['dif', 'dea', 'macd'], visibleRange)
        const padding = Number.isFinite(extremes.max) && Number.isFinite(extremes.min)
            ? Math.max(Math.abs(extremes.max), Math.abs(extremes.min)) * 0.1
            : 0

        const latestIndex = visibleRange.end - 1
        const latestPoint = latestIndex >= 0 && latestIndex < source.series.length
            ? source.series[latestIndex]
            : null

        return {
            timestamp,
            series: source.series,
            params: source.params,
            valueMin: Number.isFinite(extremes.min) ? extremes.min - padding : emptyState.valueMin,
            valueMax: Number.isFinite(extremes.max) ? extremes.max + padding : emptyState.valueMax,
            visibleMin: extremes.min,
            visibleMax: extremes.max,
            latestValues: latestPoint ? {
                dif: latestPoint.dif,
                dea: latestPoint.dea,
                macd: latestPoint.macd,
            } : undefined,
        }
    }
}

export function createDualSparseVisibleStateComposer(
    bundleKey: string,
    emptyState: {
        timestamp: number
        series: (number | undefined)[]
        signalSeries: (number | undefined)[]
        params: unknown
        valueMin: number
        valueMax: number
        visibleMin: number
        visibleMax: number
    },
): IndicatorVisibleStateComposer {
    return ({ bundle, visibleRange, timestamp, active }) => {
        const source = getDualSparseSeriesBundle(bundle, bundleKey)
        if (!active) {
            return {
                ...emptyState,
                timestamp,
                series: source.series,
                signalSeries: source.signalSeries,
                params: source.params,
            }
        }

        const seriesExtremes = calcSparseExtremes(source.series, visibleRange)
        const signalExtremes = calcSparseExtremes(source.signalSeries, visibleRange)

        const combinedMin = Math.min(seriesExtremes.min, signalExtremes.min)
        const combinedMax = Math.max(seriesExtremes.max, signalExtremes.max)

        let valueMin = emptyState.valueMin
        let valueMax = emptyState.valueMax
        if (Number.isFinite(combinedMin) && Number.isFinite(combinedMax)) {
            const range = combinedMax - combinedMin
            const padding = range > 0 ? range * 0.05 : Math.max(1, Math.abs(combinedMax) * 0.05)
            valueMin = combinedMin - padding
            valueMax = combinedMax + padding
        }

        return {
            timestamp,
            series: source.series,
            signalSeries: source.signalSeries,
            params: source.params,
            valueMin,
            valueMax,
            visibleMin: combinedMin,
            visibleMax: combinedMax,
        }
    }
}

export function createValuePointVisibleStateComposer<T extends object>(
    bundleKey: string,
    emptyState: {
        timestamp: number
        series: (T | undefined)[]
        params: unknown
        valueMin: number
        valueMax: number
        visibleMin: number
        visibleMax: number
    },
    fields: readonly (keyof T)[],
): IndicatorVisibleStateComposer {
    return ({ bundle, visibleRange, timestamp, active }) => {
        const source = getPointArraySeriesBundle<T>(bundle, bundleKey)
        if (!active) {
            return {
                ...emptyState,
                timestamp,
                series: source.series,
                params: source.params,
            }
        }

        const extremes = calcPointArrayExtremes(source.series, fields, visibleRange)
        const bounds = computeMAFamilyBounds(
            Number.isFinite(extremes.min) && Number.isFinite(extremes.max) ? extremes : null,
            emptyState,
        )
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

export function createBandVisibleStateComposer<T extends object>(
    bundleKey: string,
    emptyState: {
        timestamp: number
        series: (T | undefined)[]
        params: unknown
        valueMin: number
        valueMax: number
        visibleMin: number
        visibleMax: number
    },
    minField: keyof T,
    maxField: keyof T,
): IndicatorVisibleStateComposer {
    return ({ bundle, visibleRange, timestamp, active }) => {
        const source = getPointArraySeriesBundle<T>(bundle, bundleKey)
        if (!active) {
            return {
                ...emptyState,
                timestamp,
                series: source.series,
                params: source.params,
            }
        }

        const minExtremes = calcPointArrayExtremes(source.series, [minField], visibleRange)
        const maxExtremes = calcPointArrayExtremes(source.series, [maxField], visibleRange)
        const extremes = {
            min: minExtremes.min,
            max: maxExtremes.max,
        }
        const bounds = computeMAFamilyBounds(
            Number.isFinite(extremes.min) && Number.isFinite(extremes.max) ? extremes : null,
            emptyState,
        )
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

export function createExactRangePointVisibleStateComposer<T extends object>(
    bundleKey: string,
    emptyState: {
        timestamp: number
        series: (T | undefined)[]
        params: unknown
        valueMin: number
        valueMax: number
        visibleMin: number
        visibleMax: number
    },
    fields: readonly (keyof T)[],
): IndicatorVisibleStateComposer {
    return ({ bundle, visibleRange, timestamp, active }) => {
        const source = getPointArraySeriesBundle<T>(bundle, bundleKey)
        if (!active) {
            return {
                ...emptyState,
                timestamp,
                series: source.series,
                params: source.params,
            }
        }

        const extremes = calcPointArrayExtremes(source.series, fields, visibleRange)
        return {
            timestamp,
            series: source.series,
            params: source.params,
            valueMin: extremes.min,
            valueMax: extremes.max,
            visibleMin: extremes.min,
            visibleMax: extremes.max,
        }
    }
}

export function createFixedUnitVisibleStateComposer(
    bundleKey: string,
    emptyState: {
        timestamp: number
        series: unknown
        params: unknown
        valueMin: number
        valueMax: number
        visibleMin: number
        visibleMax: number
    },
): IndicatorVisibleStateComposer {
    return ({ bundle, timestamp, active }) => {
        const source = (bundle as unknown as Record<string, { series: unknown; params: unknown }>)[bundleKey]!
        if (!active) {
            return {
                ...emptyState,
                timestamp,
                series: source.series,
                params: source.params,
            }
        }

        return {
            timestamp,
            series: source.series,
            params: source.params,
            valueMin: 0,
            valueMax: 1,
            visibleMin: 0,
            visibleMax: 1,
        }
    }
}

export function createCCIVisibleStateComposer(
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
      valueMin: Math.min(extremes.min, emptyState.valueMin),
      valueMax: Math.max(extremes.max, emptyState.valueMax),
      visibleMin: extremes.min,
      visibleMax: extremes.max,
    }
  }
}

export function createVolumeProfileVisibleStateComposer(
    bundleKey: string,
    emptyState: {
        timestamp: number
        series: unknown
        params: unknown
        valueMin: number
        valueMax: number
        visibleMin: number
        visibleMax: number
    },
): IndicatorVisibleStateComposer {
    return ({ bundle, timestamp, active }) => {
        const source = (bundle as unknown as Record<string, { series: { bins: { priceLow: number; priceHigh: number }[]; val: number; vah: number; poc: number }; params: unknown }>)[bundleKey]!
        if (!active) {
            return {
                ...emptyState,
                timestamp,
                series: source.series,
                params: source.params,
            }
        }

        const bins = source.series.bins
        return {
            timestamp,
            series: source.series,
            params: source.params,
            valueMin: bins[0]?.priceLow ?? 0,
            valueMax: bins[bins.length - 1]?.priceHigh ?? 1,
            visibleMin: source.series.val,
            visibleMax: source.series.vah,
        }
    }
}
