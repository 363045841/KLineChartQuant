import type { BaseIndicatorState } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'

export type ZoneKind = 'FVG_BULL' | 'FVG_BEAR' | 'OB_BULL' | 'OB_BEAR'

export interface Zone {
    kind: ZoneKind
    startIndex: number
    endIndex?: number  // undefined = zone still active (not yet filled/mitigated)
    high: number
    low: number
}

export interface ZonesRenderState extends BaseIndicatorState {
    timestamp: number
    series: Zone[]
    params: {
        showFVG: boolean
        showOB: boolean
        showFilledZones: boolean
        obLookback: number  // bars to look back for the OB candle before a BOS
    }
    valueMin: number
    valueMax: number
    visibleMin: number
    visibleMax: number
}

export const createZonesStateKey = (paneId: string) =>
    createIndicatorStateKey('zones', paneId)

export const DEFAULT_ZONES_OB_LOOKBACK = 5

export const EMPTY_ZONES_STATE: ZonesRenderState = {
    timestamp: 0,
    series: [],
    params: {
        showFVG: true,
        showOB: true,
        showFilledZones: false,
        obLookback: DEFAULT_ZONES_OB_LOOKBACK,
    },
    valueMin: 0,
    valueMax: 1,
    visibleMin: Infinity,
    visibleMax: -Infinity,
}
