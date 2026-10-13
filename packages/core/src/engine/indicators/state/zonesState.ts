import type { BaseIndicatorState } from '@/foundation/plugin/index.js'

export type ZoneKind = 'FVG_BULL' | 'FVG_BEAR' | 'OB_BULL' | 'OB_BEAR'

export interface Zone {
  kind: ZoneKind
  startIndex: number
  endIndex?: number // undefined = zone still active (not yet filled/mitigated)
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
    obLookback: number // bars to look back for the OB candle before a BOS
  }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}
