import type { BaseIndicatorState } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'

export interface MFIRenderState extends BaseIndicatorState {
    timestamp: number
    series: (number | undefined)[]
    params: { period: number; showMFI: boolean }
    valueMin: number
    valueMax: number
    visibleMin: number
    visibleMax: number
}

export const createMFIStateKey = (paneId: string) =>
    createIndicatorStateKey('mfi', paneId)

export const DEFAULT_MFI_PERIOD = 14

export const EMPTY_MFI_STATE: MFIRenderState = {
    timestamp: 0,
    series: [],
    params: { period: DEFAULT_MFI_PERIOD, showMFI: true },
    valueMin: 0,
    valueMax: 100,
    visibleMin: Infinity,
    visibleMax: -Infinity,
}
