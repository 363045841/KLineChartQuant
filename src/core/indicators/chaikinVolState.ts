import type { BaseIndicatorState } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'

export interface ChaikinVolRenderState extends BaseIndicatorState {
    timestamp: number
    series: (number | undefined)[]
    params: { emaPeriod: number; rocPeriod: number; showChaikinVol: boolean }
    valueMin: number
    valueMax: number
    visibleMin: number
    visibleMax: number
}

export const createChaikinVolStateKey = (paneId: string) =>
    createIndicatorStateKey('chaikinVol', paneId)

export const DEFAULT_CHAIKIN_VOL_EMA_PERIOD = 10
export const DEFAULT_CHAIKIN_VOL_ROC_PERIOD = 10

export const EMPTY_CHAIKIN_VOL_STATE: ChaikinVolRenderState = {
    timestamp: 0,
    series: [],
    params: {
        emaPeriod: DEFAULT_CHAIKIN_VOL_EMA_PERIOD,
        rocPeriod: DEFAULT_CHAIKIN_VOL_ROC_PERIOD,
        showChaikinVol: true,
    },
    valueMin: -50,
    valueMax: 50,
    visibleMin: Infinity,
    visibleMax: -Infinity,
}
