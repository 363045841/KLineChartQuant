import type { BaseIndicatorState } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'

export interface TEMARenderState extends BaseIndicatorState {
    timestamp: number
    series: (number | undefined)[]
    params: { period: number; showTEMA: boolean }
    valueMin: number
    valueMax: number
    visibleMin: number
    visibleMax: number
}

export const createTEMAStateKey = (paneId: string) =>
    createIndicatorStateKey('tema', paneId)

export const DEFAULT_TEMA_PERIOD = 20

export const EMPTY_TEMA_STATE: TEMARenderState = {
    timestamp: 0,
    series: [],
    params: { period: DEFAULT_TEMA_PERIOD, showTEMA: true },
    valueMin: 0,
    valueMax: 1,
    visibleMin: Infinity,
    visibleMax: -Infinity,
}
