import type { BaseIndicatorState } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'

export interface DonchianPoint {
    upper: number
    middle: number
    lower: number
}

export interface DonchianRenderState extends BaseIndicatorState {
    timestamp: number
    series: (DonchianPoint | undefined)[]
    params: {
        period: number
        showUpper: boolean
        showMiddle: boolean
        showLower: boolean
    }
    valueMin: number
    valueMax: number
    visibleMin: number
    visibleMax: number
}

export const createDonchianStateKey = (paneId: string) =>
    createIndicatorStateKey('donchian', paneId)

export const DEFAULT_DONCHIAN_PERIOD = 20

export const EMPTY_DONCHIAN_STATE: DonchianRenderState = {
    timestamp: 0,
    series: [],
    params: {
        period: DEFAULT_DONCHIAN_PERIOD,
        showUpper: true,
        showMiddle: true,
        showLower: true,
    },
    valueMin: 0,
    valueMax: 1,
    visibleMin: Infinity,
    visibleMax: -Infinity,
}
