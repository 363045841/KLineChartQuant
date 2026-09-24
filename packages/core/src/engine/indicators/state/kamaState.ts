import type { BaseIndicatorState } from '@/foundation/plugin/index.js'

export interface KAMARenderState extends BaseIndicatorState {
  timestamp: number
  series: (number | undefined)[]
  params: { period: number; fastPeriod: number; slowPeriod: number; showKAMA: boolean }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

export const DEFAULT_KAMA_PERIOD = 10
export const DEFAULT_KAMA_FAST_PERIOD = 2
export const DEFAULT_KAMA_SLOW_PERIOD = 30

export const EMPTY_KAMA_STATE: KAMARenderState = {
  timestamp: 0,
  series: [],
  params: {
    period: DEFAULT_KAMA_PERIOD,
    fastPeriod: DEFAULT_KAMA_FAST_PERIOD,
    slowPeriod: DEFAULT_KAMA_SLOW_PERIOD,
    showKAMA: true,
  },
  valueMin: 0,
  valueMax: 1,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
