import type { BaseIndicatorState } from '../../../foundation/plugin/index'
import { createIndicatorStateKey } from '../../../foundation/plugin/stateKeys'
import type { KSTPoint } from '../calculators'

export interface KSTRenderState extends BaseIndicatorState {
  timestamp: number
  series: KSTPoint[]
  params: {
    roc1: number
    roc2: number
    roc3: number
    roc4: number
    signalPeriod: number
    showKST: boolean
    showSignal: boolean
  }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

export const createKSTStateKey = (paneId: string) => createIndicatorStateKey('kst', paneId)

export const EMPTY_KST_STATE: KSTRenderState = {
  timestamp: 0,
  series: [],
  params: {
    roc1: 10,
    roc2: 15,
    roc3: 20,
    roc4: 30,
    signalPeriod: 9,
    showKST: true,
    showSignal: true,
  },
  valueMin: 0,
  valueMax: 0,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
