import type { BaseIndicatorState } from '../../../foundation/plugin/index'
import { createIndicatorStateKey } from '../../../foundation/plugin/stateKeys'

export interface CCIRenderState extends BaseIndicatorState {
  timestamp: number
  series: (number | undefined)[]
  params: { period: number; showCCI: boolean }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

export const createCCIStateKey = (paneId: string) => createIndicatorStateKey('cci', paneId)

export const EMPTY_CCI_STATE: CCIRenderState = {
  timestamp: 0,
  series: [],
  params: { period: 14, showCCI: true },
  valueMin: -150,
  valueMax: 150,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
