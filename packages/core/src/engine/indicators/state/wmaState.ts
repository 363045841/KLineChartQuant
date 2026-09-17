import type { BaseIndicatorState } from '../../../foundation/plugin/index.js'
import { createIndicatorStateKey } from '../../../foundation/plugin/stateKeys.js'

export interface WMARenderState extends BaseIndicatorState {
  timestamp: number
  series: (number | undefined)[]
  params: { period: number; showWMA: boolean }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

export const createWMAStateKey = (paneId: string) => createIndicatorStateKey('wma', paneId)

export const DEFAULT_WMA_PERIOD = 9

export const EMPTY_WMA_STATE: WMARenderState = {
  timestamp: 0,
  series: [],
  params: { period: DEFAULT_WMA_PERIOD, showWMA: true },
  valueMin: 0,
  valueMax: 1,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
