import type { BaseIndicatorState } from '../../../foundation/plugin/index'
import { createIndicatorStateKey } from '../../../foundation/plugin/stateKeys'

export interface MOMRenderState extends BaseIndicatorState {
  timestamp: number
  series: (number | undefined)[]
  params: { period: number; showMOM: boolean }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

export const createMOMStateKey = (paneId: string) => createIndicatorStateKey('mom', paneId)

export const EMPTY_MOM_STATE: MOMRenderState = {
  timestamp: 0,
  series: [],
  params: { period: 10, showMOM: true },
  valueMin: 0,
  valueMax: 0,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
