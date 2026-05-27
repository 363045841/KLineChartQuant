import type { BaseIndicatorState } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'

export interface PVTRenderState extends BaseIndicatorState {
    timestamp: number
    series: (number | undefined)[]
    params: { showPVT: boolean }
    valueMin: number
    valueMax: number
    visibleMin: number
    visibleMax: number
}

export const createPVTStateKey = (paneId: string) =>
    createIndicatorStateKey('pvt', paneId)

export const EMPTY_PVT_STATE: PVTRenderState = {
    timestamp: 0,
    series: [],
    params: { showPVT: true },
    valueMin: 0,
    valueMax: 1,
    visibleMin: Infinity,
    visibleMax: -Infinity,
}
