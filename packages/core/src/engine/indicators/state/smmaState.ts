/**
 * SMMA 指标渲染状态定义（Wilder 平滑移动平均）
 */

import type { BaseIndicatorState } from '../../../foundation/plugin/index'
import { createIndicatorStateKey } from '../../../foundation/plugin/stateKeys'

export interface SMMARenderState extends BaseIndicatorState {
  timestamp: number
  series: (number | undefined)[]
  params: { period: number; showSMMA: boolean }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

/** 生成指定 pane 的 SMMA 状态 key */
export const createSMMAStateKey = (paneId: string) => createIndicatorStateKey('smma', paneId)

export const DEFAULT_SMMA_PERIOD = 14

/** 空 SMMA 状态（未计算前使用） */
export const EMPTY_SMMA_STATE: SMMARenderState = {
  timestamp: 0,
  series: [],
  params: { period: DEFAULT_SMMA_PERIOD, showSMMA: true },
  valueMin: 0,
  valueMax: 1,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
