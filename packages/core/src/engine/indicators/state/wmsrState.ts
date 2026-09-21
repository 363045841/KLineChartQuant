import type { BaseIndicatorState } from '../../../foundation/plugin/index.js'

export interface WMSRRenderState extends BaseIndicatorState {
  timestamp: number
  series: (number | undefined)[]
  params: { period: number; showWMSR: boolean }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

export const EMPTY_WMSR_STATE: WMSRRenderState = {
  timestamp: 0,
  series: [],
  params: { period: 14, showWMSR: true },
  valueMin: -100,
  valueMax: 0,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
