/**
 * T3 指标渲染状态定义
 * 定义单线序列、状态 key 工厂与主图默认参数。
 */
import type { BaseIndicatorState } from '../../../foundation/plugin/index'
import { createIndicatorStateKey } from '../../../foundation/plugin/stateKeys'

export interface T3RenderState extends BaseIndicatorState {
  timestamp: number
  series: (number | undefined)[]
  params: { period: number; volumeFactor: number; showT3: boolean }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

/** 根据 pane ID 创建 T3 共享状态 key。 */
export const createT3StateKey = (paneId: string) => createIndicatorStateKey('t3', paneId)

export const DEFAULT_T3_PERIOD = 5
export const DEFAULT_T3_VOLUME_FACTOR = 0.7

export const EMPTY_T3_STATE: T3RenderState = {
  timestamp: 0,
  series: [],
  params: {
    period: DEFAULT_T3_PERIOD,
    volumeFactor: DEFAULT_T3_VOLUME_FACTOR,
    showT3: true,
  },
  valueMin: 0,
  valueMax: 1,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
