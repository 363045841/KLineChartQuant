/**
 * Awesome Oscillator 渲染状态定义及默认值。
 */

import type { BaseIndicatorState } from '../../../foundation/plugin/index'
import { createIndicatorStateKey } from '../../../foundation/plugin/stateKeys'

export interface AwesomeOscillatorRenderState extends BaseIndicatorState {
  timestamp: number
  series: (number | undefined)[]
  params: { fast: number; slow: number; showAO: boolean }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

export const DEFAULT_AO_FAST_PERIOD = 5
export const DEFAULT_AO_SLOW_PERIOD = 34

/**
 * 创建 Awesome Oscillator 的 pane 级状态键。
 * @param paneId 目标副图 ID。
 * @returns AO 状态命名空间键。
 */
export const createAwesomeOscillatorStateKey = (paneId: string) =>
  createIndicatorStateKey('awesomeOscillator', paneId)

export const EMPTY_AO_STATE: AwesomeOscillatorRenderState = {
  timestamp: 0,
  series: [],
  params: {
    fast: DEFAULT_AO_FAST_PERIOD,
    slow: DEFAULT_AO_SLOW_PERIOD,
    showAO: true,
  },
  valueMin: -1,
  valueMax: 1,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
