import type { BaseIndicatorState } from '../../../foundation/plugin/index.js'

export interface SuperTrendPoint {
  value: number
  trend: 'up' | 'down'
}

export interface SuperTrendRenderState extends BaseIndicatorState {
  timestamp: number
  series: (SuperTrendPoint | undefined)[]
  params: { atrPeriod: number; multiplier: number; showSuperTrend: boolean }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

export const DEFAULT_SUPERTREND_ATR_PERIOD = 10
export const DEFAULT_SUPERTREND_MULTIPLIER = 3

export const EMPTY_SUPERTREND_STATE: SuperTrendRenderState = {
  timestamp: 0,
  series: [],
  params: {
    atrPeriod: DEFAULT_SUPERTREND_ATR_PERIOD,
    multiplier: DEFAULT_SUPERTREND_MULTIPLIER,
    showSuperTrend: true,
  },
  valueMin: 0,
  valueMax: 1,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
