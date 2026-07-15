import type { BaseIndicatorState } from '../../../foundation/plugin/index'
import { createIndicatorStateKey } from '../../../foundation/plugin/stateKeys'
import type { ENEPoint } from '../calculators'

export const DEFAULT_ENE_PERIOD = 10
export const DEFAULT_ENE_DEVIATION = 11

/**
 * ENE 渲染器状态（共享给渲染器和图例）
 * 包含全量 ENE 数组、计算参数、以及视口极值
 */
export interface ENERenderState extends BaseIndicatorState {
  timestamp: number
  /** 全量 ENE 数组（稀疏：前 period-1 个为 undefined） */
  series: ENEPoint[]
  /** 计算参数 */
  params: {
    period: number
    deviation: number
  }
  /** 视口内所有 ENE 线的最低价 */
  visibleMin: number
  /** 视口内所有 ENE 线的最高价 */
  visibleMax: number
}

/**
 * ENE 状态的 StateStore 键名
 * 格式：indicator:ene:main
 */
export const ENE_STATE_KEY = createIndicatorStateKey('ene', 'main')

/**
 * 空数据占位状态
 * 消费者应检查 visibleMin > visibleMax 判断"无有效数据"
 */
export const EMPTY_ENE_STATE: ENERenderState = {
  timestamp: 0,
  series: [],
  params: {
    period: DEFAULT_ENE_PERIOD,
    deviation: DEFAULT_ENE_DEVIATION,
  },
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
