import type { BaseIndicatorState } from '../../../foundation/plugin/index.js'

export interface OBVRenderState extends BaseIndicatorState {
  timestamp: number
  series: (number | undefined)[]
  params: { showOBV: boolean }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

export const EMPTY_OBV_STATE: OBVRenderState = {
  timestamp: 0,
  series: [],
  params: { showOBV: true },
  valueMin: 0,
  valueMax: 1,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
