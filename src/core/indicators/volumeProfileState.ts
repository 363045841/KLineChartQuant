import type { BaseIndicatorState } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'

export interface VolumeProfileBin {
    priceLow: number
    priceHigh: number
    volume: number
}

export interface VolumeProfileResult {
    bins: VolumeProfileBin[]
    poc: number      // Point of Control: price center of max-volume bin
    vah: number      // Value Area High: upper bound of 70% volume area
    val: number      // Value Area Low: lower bound of 70% volume area
    totalVolume: number
}

export interface VolumeProfileRenderState extends BaseIndicatorState {
    timestamp: number
    series: VolumeProfileResult
    params: {
        bins: number
        lookback: number
        valueAreaPercent: number
        showPOC: boolean
        showValueArea: boolean
    }
    valueMin: number
    valueMax: number
    visibleMin: number
    visibleMax: number
}

export const createVolumeProfileStateKey = (paneId: string) =>
    createIndicatorStateKey('volumeProfile', paneId)

export const DEFAULT_VP_BINS = 24
export const DEFAULT_VP_LOOKBACK = 0  // 0 = use entire data
export const DEFAULT_VP_VALUE_AREA = 0.7

export const EMPTY_VP_RESULT: VolumeProfileResult = {
    bins: [],
    poc: 0,
    vah: 0,
    val: 0,
    totalVolume: 0,
}

export const EMPTY_VOLUME_PROFILE_STATE: VolumeProfileRenderState = {
    timestamp: 0,
    series: EMPTY_VP_RESULT,
    params: {
        bins: DEFAULT_VP_BINS,
        lookback: DEFAULT_VP_LOOKBACK,
        valueAreaPercent: DEFAULT_VP_VALUE_AREA,
        showPOC: true,
        showValueArea: true,
    },
    valueMin: 0,
    valueMax: 1,
    visibleMin: Infinity,
    visibleMax: -Infinity,
}
