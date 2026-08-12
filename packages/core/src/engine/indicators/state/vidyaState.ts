/**
 * VIDYA 指标渲染状态定义
 * 定义单线序列、状态 key 工厂与主图默认参数。
 */
import type { BaseIndicatorState } from '../../../foundation/plugin/index'
import { createIndicatorStateKey } from '../../../foundation/plugin/stateKeys'

export interface VIDYARenderState extends BaseIndicatorState {
  timestamp: number
  series: (number | undefined)[]
  params: { period: number; cmoPeriod: number; showVIDYA: boolean }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

/** 根据 pane ID 创建 VIDYA 共享状态 key。 */
export const createVIDYAStateKey = (paneId: string) => createIndicatorStateKey('vidya', paneId)

export const DEFAULT_VIDYA_PERIOD = 14
export const DEFAULT_VIDYA_CMO_PERIOD = 9

export const EMPTY_VIDYA_STATE: VIDYARenderState = {
  timestamp: 0,
  series: [],
  params: {
    period: DEFAULT_VIDYA_PERIOD,
    cmoPeriod: DEFAULT_VIDYA_CMO_PERIOD,
    showVIDYA: true,
  },
  valueMin: 0,
  valueMax: 1,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
