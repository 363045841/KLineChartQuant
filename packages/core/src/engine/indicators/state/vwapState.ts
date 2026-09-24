import type { BaseIndicatorState } from '@/foundation/plugin/index.js'

export interface VWAPRenderState extends BaseIndicatorState {
  timestamp: number
  series: (number | undefined)[]
  params: { sessionResetGapMs: number; showVWAP: boolean }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

// 0 = never reset (entire data is one session)
// > 0 = reset session when consecutive bars' timestamps differ by more than this
export const DEFAULT_VWAP_SESSION_GAP_MS = 0

export const EMPTY_VWAP_STATE: VWAPRenderState = {
  timestamp: 0,
  series: [],
  params: { sessionResetGapMs: DEFAULT_VWAP_SESSION_GAP_MS, showVWAP: true },
  valueMin: 0,
  valueMax: 1,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
