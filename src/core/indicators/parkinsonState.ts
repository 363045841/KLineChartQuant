import type { BaseIndicatorState } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'

export interface ParkinsonRenderState extends BaseIndicatorState {
    timestamp: number
    series: (number | undefined)[]
    params: { period: number; annualizationFactor: number; showParkinson: boolean }
    valueMin: number
    valueMax: number
    visibleMin: number
    visibleMax: number
}

export const createParkinsonStateKey = (paneId: string) =>
    createIndicatorStateKey('parkinson', paneId)

export const DEFAULT_PARKINSON_PERIOD = 20
export const DEFAULT_PARKINSON_ANNUALIZATION = 252

export const EMPTY_PARKINSON_STATE: ParkinsonRenderState = {
    timestamp: 0,
    series: [],
    params: { period: DEFAULT_PARKINSON_PERIOD, annualizationFactor: DEFAULT_PARKINSON_ANNUALIZATION, showParkinson: true },
    valueMin: 0,
    valueMax: 1,
    visibleMin: Infinity,
    visibleMax: -Infinity,
}
