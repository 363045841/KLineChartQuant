import type { BaseIndicatorState } from '../../../foundation/plugin/index.js'

export interface CMFRenderState extends BaseIndicatorState {
  timestamp: number
  series: (number | undefined)[]
  params: { period: number; showCMF: boolean }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

export const DEFAULT_CMF_PERIOD = 20

export const EMPTY_CMF_STATE: CMFRenderState = {
  timestamp: 0,
  series: [],
  params: { period: DEFAULT_CMF_PERIOD, showCMF: true },
  valueMin: -1,
  valueMax: 1,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
