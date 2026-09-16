import type { BaseIndicatorState } from '../../../foundation/plugin/index.js'
import { createIndicatorStateKey } from '../../../foundation/plugin/stateKeys.js'
import type { STOCHPoint } from '../calculators/index.js'

export interface STOCHRenderState extends BaseIndicatorState {
  timestamp: number
  series: STOCHPoint[]
  params: { n: number; m: number; showK: boolean; showD: boolean; showJ: boolean }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

export const createSTOCHStateKey = (paneId: string) => createIndicatorStateKey('stoch', paneId)

export const EMPTY_STOCH_STATE: STOCHRenderState = {
  timestamp: 0,
  series: [],
  params: { n: 9, m: 3, showK: true, showD: true, showJ: true },
  valueMin: 0,
  valueMax: 100,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
