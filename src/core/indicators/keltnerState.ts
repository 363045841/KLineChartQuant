import type { BaseIndicatorState } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'

export interface KeltnerPoint {
    upper: number
    middle: number
    lower: number
}

export interface KeltnerRenderState extends BaseIndicatorState {
    timestamp: number
    series: (KeltnerPoint | undefined)[]
    params: {
        emaPeriod: number
        atrPeriod: number
        multiplier: number
        showUpper: boolean
        showMiddle: boolean
        showLower: boolean
    }
    valueMin: number
    valueMax: number
    visibleMin: number
    visibleMax: number
}

export const createKeltnerStateKey = (paneId: string) =>
    createIndicatorStateKey('keltner', paneId)

export const DEFAULT_KELTNER_EMA_PERIOD = 20
export const DEFAULT_KELTNER_ATR_PERIOD = 10
export const DEFAULT_KELTNER_MULTIPLIER = 2

export const EMPTY_KELTNER_STATE: KeltnerRenderState = {
    timestamp: 0,
    series: [],
    params: {
        emaPeriod: DEFAULT_KELTNER_EMA_PERIOD,
        atrPeriod: DEFAULT_KELTNER_ATR_PERIOD,
        multiplier: DEFAULT_KELTNER_MULTIPLIER,
        showUpper: true,
        showMiddle: true,
        showLower: true,
    },
    valueMin: 0,
    valueMax: 1,
    visibleMin: Infinity,
    visibleMax: -Infinity,
}
