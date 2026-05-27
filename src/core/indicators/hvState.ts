import type { BaseIndicatorState } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'

export interface HVRenderState extends BaseIndicatorState {
    timestamp: number
    series: (number | undefined)[]
    params: { period: number; annualizationFactor: number; showHV: boolean }
    valueMin: number
    valueMax: number
    visibleMin: number
    visibleMax: number
}

export const createHVStateKey = (paneId: string) =>
    createIndicatorStateKey('hv', paneId)

export const DEFAULT_HV_PERIOD = 20
export const DEFAULT_HV_ANNUALIZATION = 252

export const EMPTY_HV_STATE: HVRenderState = {
    timestamp: 0,
    series: [],
    params: { period: DEFAULT_HV_PERIOD, annualizationFactor: DEFAULT_HV_ANNUALIZATION, showHV: true },
    valueMin: 0,
    valueMax: 1,
    visibleMin: Infinity,
    visibleMax: -Infinity,
}
