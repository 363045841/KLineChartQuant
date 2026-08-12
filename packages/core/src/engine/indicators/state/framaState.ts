/**
 * FRAMA 指标渲染状态定义
 * 定义单线序列、状态 key 工厂与主图默认参数。
 */
import type { BaseIndicatorState } from '../../../foundation/plugin/index'
import { createIndicatorStateKey } from '../../../foundation/plugin/stateKeys'

export interface FRAMARenderState extends BaseIndicatorState {
  timestamp: number
  series: (number | undefined)[]
  params: { period: number; showFRAMA: boolean }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

/** 根据 pane ID 创建 FRAMA 共享状态 key。 */
export const createFRAMAStateKey = (paneId: string) => createIndicatorStateKey('frama', paneId)

export const DEFAULT_FRAMA_PERIOD = 16

export const EMPTY_FRAMA_STATE: FRAMARenderState = {
  timestamp: 0,
  series: [],
  params: { period: DEFAULT_FRAMA_PERIOD, showFRAMA: true },
  valueMin: 0,
  valueMax: 1,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
