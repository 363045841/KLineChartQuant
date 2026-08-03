/**
 * ALMA（Arnaud Legoux 移动平均）指标渲染状态定义
 * 定义单线序列的渲染状态结构、状态 key 工厂与默认参数
 */
import type { BaseIndicatorState } from '../../../foundation/plugin/index'
import { createIndicatorStateKey } from '../../../foundation/plugin/stateKeys'

export interface ALMARenderState extends BaseIndicatorState {
  timestamp: number
  series: (number | undefined)[]
  params: { period: number; offset: number; sigma: number; showALMA: boolean }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

export const createALMAStateKey = (paneId: string) => createIndicatorStateKey('alma', paneId)

export const DEFAULT_ALMA_PERIOD = 9
export const DEFAULT_ALMA_OFFSET = 0.85
export const DEFAULT_ALMA_SIGMA = 6

export const EMPTY_ALMA_STATE: ALMARenderState = {
  timestamp: 0,
  series: [],
  params: {
    period: DEFAULT_ALMA_PERIOD,
    offset: DEFAULT_ALMA_OFFSET,
    sigma: DEFAULT_ALMA_SIGMA,
    showALMA: true,
  },
  valueMin: 0,
  valueMax: 1,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
