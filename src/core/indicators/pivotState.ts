import type { BaseIndicatorState } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'

export interface PivotPoint {
    pp: number
    r1: number
    r2: number
    r3: number
    s1: number
    s2: number
    s3: number
}

export interface PivotRenderState extends BaseIndicatorState {
    timestamp: number
    series: (PivotPoint | undefined)[]
    params: {
        showPP: boolean
        showR1: boolean
        showR2: boolean
        showR3: boolean
        showS1: boolean
        showS2: boolean
        showS3: boolean
    }
    valueMin: number
    valueMax: number
    visibleMin: number
    visibleMax: number
}

export const createPivotStateKey = (paneId: string) =>
    createIndicatorStateKey('pivot', paneId)

export const EMPTY_PIVOT_STATE: PivotRenderState = {
    timestamp: 0,
    series: [],
    params: {
        showPP: true,
        showR1: true,
        showR2: true,
        showR3: false,
        showS1: true,
        showS2: true,
        showS3: false,
    },
    valueMin: 0,
    valueMax: 1,
    visibleMin: Infinity,
    visibleMax: -Infinity,
}
