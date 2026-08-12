/**
 * Schaff Trend Cycle 渲染状态定义及默认配置。
 */

import type { BaseIndicatorState } from '../../../foundation/plugin/index'
import { createIndicatorStateKey } from '../../../foundation/plugin/stateKeys'

export interface SchaffTrendCycleRenderState extends BaseIndicatorState {
  timestamp: number
  series: (number | undefined)[]
  params: { fast: number; slow: number; cycle: number; factor: number; showSTC: boolean }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

/**
 * 创建 Schaff Trend Cycle 的 pane 级状态键。
 * @param paneId 目标副图 ID。
 * @returns STC 状态命名空间键。
 */
export const createSchaffTrendCycleStateKey = (paneId: string) =>
  createIndicatorStateKey('schaffTrendCycle', paneId)

export const EMPTY_SCHAFF_TREND_CYCLE_STATE: SchaffTrendCycleRenderState = {
  timestamp: 0,
  series: [],
  params: { fast: 23, slow: 50, cycle: 10, factor: 0.5, showSTC: true },
  valueMin: 0,
  valueMax: 100,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
