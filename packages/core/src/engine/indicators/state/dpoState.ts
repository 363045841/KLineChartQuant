/**
 * DPO 渲染状态定义及默认值。
 */

import type { BaseIndicatorState } from '../../../foundation/plugin/index'
import { createIndicatorStateKey } from '../../../foundation/plugin/stateKeys'

export interface DPORenderState extends BaseIndicatorState {
  timestamp: number
  series: (number | undefined)[]
  params: { period: number; showDPO: boolean }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

export const DEFAULT_DPO_PERIOD = 20

/**
 * 创建 DPO 的 pane 级状态键。
 * @param paneId 目标副图 ID。
 * @returns DPO 状态命名空间键。
 */
export const createDPOStateKey = (paneId: string) => createIndicatorStateKey('dpo', paneId)

export const EMPTY_DPO_STATE: DPORenderState = {
  timestamp: 0,
  series: [],
  params: { period: DEFAULT_DPO_PERIOD, showDPO: true },
  valueMin: -1,
  valueMax: 1,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
