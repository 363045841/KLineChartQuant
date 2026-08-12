/**
 * Ultimate Oscillator 渲染状态定义及默认值。
 */

import type { BaseIndicatorState } from '../../../foundation/plugin/index'
import { createIndicatorStateKey } from '../../../foundation/plugin/stateKeys'

export interface UltimateOscillatorRenderState extends BaseIndicatorState {
  timestamp: number
  series: (number | undefined)[]
  params: { p1: number; p2: number; p3: number; showUO: boolean }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

export const DEFAULT_UO_P1 = 7
export const DEFAULT_UO_P2 = 14
export const DEFAULT_UO_P3 = 28

/**
 * 创建 Ultimate Oscillator 的 pane 级状态键。
 * @param paneId 目标副图 ID。
 * @returns UO 状态命名空间键。
 */
export const createUltimateOscillatorStateKey = (paneId: string) =>
  createIndicatorStateKey('ultimateOscillator', paneId)

export const EMPTY_UO_STATE: UltimateOscillatorRenderState = {
  timestamp: 0,
  series: [],
  params: {
    p1: DEFAULT_UO_P1,
    p2: DEFAULT_UO_P2,
    p3: DEFAULT_UO_P3,
    showUO: true,
  },
  valueMin: 0,
  valueMax: 100,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
