import type { BaseIndicatorState } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'

export interface ROCRenderState extends BaseIndicatorState {
    timestamp: number
    series: (number | undefined)[]
    params: { period: number; showROC: boolean }
    valueMin: number
    valueMax: number
    visibleMin: number
    visibleMax: number
}

export const createROCStateKey = (paneId: string) =>
    createIndicatorStateKey('roc', paneId)

export const DEFAULT_ROC_PERIOD = 12

export const EMPTY_ROC_STATE: ROCRenderState = {
    timestamp: 0,
    series: [],
    params: { period: DEFAULT_ROC_PERIOD, showROC: true },
    valueMin: -10,
    valueMax: 10,
    visibleMin: Infinity,
    visibleMax: -Infinity,
}
