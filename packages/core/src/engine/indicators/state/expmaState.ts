import type { BaseIndicatorState } from '../../../foundation/plugin/index'
import { createIndicatorStateKey } from '../../../foundation/plugin/stateKeys'
import type { EXPMAPoint } from '../calculators'

export const DEFAULT_EXPMA_FAST_PERIOD = 12
export const DEFAULT_EXPMA_SLOW_PERIOD = 50

/**
 * EXPMA 渲染器状态（共享给渲染器和图例）
 * 包含全量 EXPMA 数组、计算参数、以及视口极值
 */
export interface EXPMARenderState extends BaseIndicatorState {
  timestamp: number
  /** 全量 EXPMA 数组（密集：从 index 0 开始） */
  series: EXPMAPoint[]
  /** 计算参数 */
  params: {
    fastPeriod: number
    slowPeriod: number
  }
  /** 视口内所有 EXPMA 线的最低价 */
  visibleMin: number
  /** 视口内所有 EXPMA 线的最高价 */
  visibleMax: number
}

/**
 * EXPMA 状态的 StateStore 键名
 * 格式：indicator:expma:main
 */
export const EXPMA_STATE_KEY = createIndicatorStateKey('expma', 'main')

/**
 * 空数据占位状态
 * 消费者应检查 visibleMin > visibleMax 判断"无有效数据"
 */
export const EMPTY_EXPMA_STATE: EXPMARenderState = {
  timestamp: 0,
  series: [],
  params: {
    fastPeriod: DEFAULT_EXPMA_FAST_PERIOD,
    slowPeriod: DEFAULT_EXPMA_SLOW_PERIOD,
  },
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
