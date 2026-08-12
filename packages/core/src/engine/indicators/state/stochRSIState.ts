/**
 * StochRSI 渲染状态定义及默认配置。
 */

import type { BaseIndicatorState } from '../../../foundation/plugin/index'
import { createIndicatorStateKey } from '../../../foundation/plugin/stateKeys'
import type { StochRSIPoint } from '../calculators/stochRSI'

export interface StochRSIRenderState extends BaseIndicatorState {
  timestamp: number
  series: (StochRSIPoint | undefined)[]
  params: {
    period: number
    kPeriod: number
    dPeriod: number
    showK: boolean
    showD: boolean
  }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

/**
 * 创建 StochRSI 的 pane 级状态键。
 * @param paneId 目标副图 ID。
 * @returns StochRSI 状态命名空间键。
 */
export const createStochRSIStateKey = (paneId: string) =>
  createIndicatorStateKey('stochRSI', paneId)

export const EMPTY_STOCH_RSI_STATE: StochRSIRenderState = {
  timestamp: 0,
  series: [],
  params: {
    period: 14,
    kPeriod: 3,
    dPeriod: 3,
    showK: true,
    showD: true,
  },
  valueMin: 0,
  valueMax: 100,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
