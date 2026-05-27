import type { BaseIndicatorState } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'

export interface TRIXRenderState extends BaseIndicatorState {
    timestamp: number
    series: (number | undefined)[]
    params: { period: number; signalPeriod: number; showTRIX: boolean; showSignal: boolean }
    signalSeries: (number | undefined)[]
    valueMin: number
    valueMax: number
    visibleMin: number
    visibleMax: number
}

export const createTRIXStateKey = (paneId: string) =>
    createIndicatorStateKey('trix', paneId)

export const DEFAULT_TRIX_PERIOD = 15
export const DEFAULT_TRIX_SIGNAL_PERIOD = 9

export const EMPTY_TRIX_STATE: TRIXRenderState = {
    timestamp: 0,
    series: [],
    signalSeries: [],
    params: {
        period: DEFAULT_TRIX_PERIOD,
        signalPeriod: DEFAULT_TRIX_SIGNAL_PERIOD,
        showTRIX: true,
        showSignal: true,
    },
    valueMin: -10,
    valueMax: 10,
    visibleMin: Infinity,
    visibleMax: -Infinity,
}
