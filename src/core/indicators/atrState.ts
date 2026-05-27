import type { BaseIndicatorState } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'

export interface ATRRenderState extends BaseIndicatorState {
    timestamp: number
    series: (number | undefined)[]
    params: { period: number; showATR: boolean }
    valueMin: number
    valueMax: number
    visibleMin: number
    visibleMax: number
}

export const createATRStateKey = (paneId: string) =>
    createIndicatorStateKey('atr', paneId)

export const DEFAULT_ATR_PERIOD = 14

export const EMPTY_ATR_STATE: ATRRenderState = {
    timestamp: 0,
    series: [],
    params: { period: DEFAULT_ATR_PERIOD, showATR: true },
    valueMin: 0,
    valueMax: 1,
    visibleMin: Infinity,
    visibleMax: -Infinity,
}
