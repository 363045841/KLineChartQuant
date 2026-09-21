import type { BaseIndicatorState } from '../../../foundation/plugin/index.js'

export interface DEMARenderState extends BaseIndicatorState {
  timestamp: number
  series: (number | undefined)[]
  params: { period: number; showDEMA: boolean }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

export const DEFAULT_DEMA_PERIOD = 20

export const EMPTY_DEMA_STATE: DEMARenderState = {
  timestamp: 0,
  series: [],
  params: { period: DEFAULT_DEMA_PERIOD, showDEMA: true },
  valueMin: 0,
  valueMax: 1,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
