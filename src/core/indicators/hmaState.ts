import type { BaseIndicatorState } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'

export interface HMARenderState extends BaseIndicatorState {
    timestamp: number
    series: (number | undefined)[]
    params: { period: number; showHMA: boolean }
    valueMin: number
    valueMax: number
    visibleMin: number
    visibleMax: number
}

export const createHMAStateKey = (paneId: string) =>
    createIndicatorStateKey('hma', paneId)

export const DEFAULT_HMA_PERIOD = 9

export const EMPTY_HMA_STATE: HMARenderState = {
    timestamp: 0,
    series: [],
    params: { period: DEFAULT_HMA_PERIOD, showHMA: true },
    valueMin: 0,
    valueMax: 1,
    visibleMin: Infinity,
    visibleMax: -Infinity,
}
