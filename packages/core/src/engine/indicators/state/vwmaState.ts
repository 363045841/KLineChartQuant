import type { BaseIndicatorState } from '../../../foundation/plugin/index'
import { createIndicatorStateKey } from '../../../foundation/plugin/stateKeys'

export interface VWMARenderState extends BaseIndicatorState {
  timestamp: number
  series: (number | undefined)[]
  params: { period: number; showVWMA: boolean }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

export const createVWMAStateKey = (paneId: string) => createIndicatorStateKey('vwma', paneId)

export const DEFAULT_VWMA_PERIOD = 20

export const EMPTY_VWMA_STATE: VWMARenderState = {
  timestamp: 0,
  series: [],
  params: { period: DEFAULT_VWMA_PERIOD, showVWMA: true },
  valueMin: 0,
  valueMax: 1,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
