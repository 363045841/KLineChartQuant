import type { BaseIndicatorState } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'

export interface OBVRenderState extends BaseIndicatorState {
    timestamp: number
    series: (number | undefined)[]
    params: { showOBV: boolean }
    valueMin: number
    valueMax: number
    visibleMin: number
    visibleMax: number
}

export const createOBVStateKey = (paneId: string) =>
    createIndicatorStateKey('obv', paneId)

export const EMPTY_OBV_STATE: OBVRenderState = {
    timestamp: 0,
    series: [],
    params: { showOBV: true },
    valueMin: 0,
    valueMax: 1,
    visibleMin: Infinity,
    visibleMax: -Infinity,
}
