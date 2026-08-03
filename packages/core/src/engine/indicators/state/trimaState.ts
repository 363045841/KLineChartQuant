// TRIMA 指标渲染状态的键创建与空状态定义（供渲染器与 titleInfo 复用）
import type { BaseIndicatorState } from '../../../foundation/plugin/index'
import { createIndicatorStateKey } from '../../../foundation/plugin/stateKeys'

export interface TRIMARenderState extends BaseIndicatorState {
  timestamp: number
  series: (number | undefined)[]
  params: { period: number; showTRIMA: boolean }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

export const createTRIMAStateKey = (paneId: string) => createIndicatorStateKey('trima', paneId)

export const DEFAULT_TRIMA_PERIOD = 20

export const EMPTY_TRIMA_STATE: TRIMARenderState = {
  timestamp: 0,
  series: [],
  params: { period: DEFAULT_TRIMA_PERIOD, showTRIMA: true },
  valueMin: 0,
  valueMax: 1,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
