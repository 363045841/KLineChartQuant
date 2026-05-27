import type { BaseIndicatorState } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'

export interface FibPoint {
    high: number
    low: number
    direction: 'up' | 'down'
    level236: number
    level382: number
    level500: number
    level618: number
    level786: number
}

export interface FibRenderState extends BaseIndicatorState {
    timestamp: number
    series: (FibPoint | undefined)[]
    params: {
        period: number
        showLevels: boolean
    }
    valueMin: number
    valueMax: number
    visibleMin: number
    visibleMax: number
}

export const createFibStateKey = (paneId: string) =>
    createIndicatorStateKey('fib', paneId)

export const DEFAULT_FIB_PERIOD = 50

export const EMPTY_FIB_STATE: FibRenderState = {
    timestamp: 0,
    series: [],
    params: { period: DEFAULT_FIB_PERIOD, showLevels: true },
    valueMin: 0,
    valueMax: 1,
    visibleMin: Infinity,
    visibleMax: -Infinity,
}
