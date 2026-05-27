import type { BaseIndicatorState } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'

export interface VMARenderState extends BaseIndicatorState {
    timestamp: number
    series: (number | undefined)[]
    params: { period: number; showVMA: boolean }
    valueMin: number
    valueMax: number
    visibleMin: number
    visibleMax: number
}

export const createVMAStateKey = (paneId: string) =>
    createIndicatorStateKey('vma', paneId)

export const DEFAULT_VMA_PERIOD = 5

export const EMPTY_VMA_STATE: VMARenderState = {
    timestamp: 0,
    series: [],
    params: { period: DEFAULT_VMA_PERIOD, showVMA: true },
    valueMin: 0,
    valueMax: 1,
    visibleMin: Infinity,
    visibleMax: -Infinity,
}
