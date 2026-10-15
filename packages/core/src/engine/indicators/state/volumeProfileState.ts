import type { BaseIndicatorState } from '@/foundation/plugin/index.js'

export interface VolumeProfileBin {
  priceLow: number
  priceHigh: number
  volume: number
}

export interface VolumeProfileResult {
  bins: VolumeProfileBin[]
  poc: number // Point of Control: price center of max-volume bin
  vah: number // Value Area High: upper bound of 70% volume area
  val: number // Value Area Low: lower bound of 70% volume area
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
