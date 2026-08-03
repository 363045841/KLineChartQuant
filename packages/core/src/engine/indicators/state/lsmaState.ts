import type { BaseIndicatorState } from '../../../foundation/plugin/index'
import { createIndicatorStateKey } from '../../../foundation/plugin/stateKeys'

export interface LSMARenderState extends BaseIndicatorState {
  timestamp: number
  series: (number | undefined)[]
  params: { period: number; showLSMA: boolean }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

export const createLSMAStateKey = (paneId: string) => createIndicatorStateKey('lsma', paneId)

export const DEFAULT_LSMA_PERIOD = 25

export const EMPTY_LSMA_STATE: LSMARenderState = {
  timestamp: 0,
  series: [],
  params: { period: DEFAULT_LSMA_PERIOD, showLSMA: true },
  valueMin: 0,
  valueMax: 1,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
