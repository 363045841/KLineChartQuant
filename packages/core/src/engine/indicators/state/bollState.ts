import type { BaseIndicatorState } from '../../../foundation/plugin/index'
import { createIndicatorStateKey } from '../../../foundation/plugin/stateKeys'
import type { BOLLPoint } from '../calculators'

export const DEFAULT_BOLL_PERIOD = 20
export const DEFAULT_BOLL_MULTIPLIER = 2

/**
 * BOLL 渲染器状态（共享给渲染器和图例）
 * 包含全量 BOLL 数组、计算参数、以及视口极值
 */
export interface BOLLRenderState extends BaseIndicatorState {
  timestamp: number
  /** 全量 BOLL 数组（稀疏：前 period-1 个为 undefined） */
  series: BOLLPoint[]
  /** 计算和渲染参数（渲染器从此读取 showUpper/showMiddle/showLower/showBand） */
  params: {
    period: number
    multiplier: number
    showUpper: boolean
    showMiddle: boolean
    showLower: boolean
    showBand: boolean
  }
  /** 视口内所有 BOLL 线的最低价 */
  visibleMin: number
  /** 视口内所有 BOLL 线的最高价 */
  visibleMax: number
}

/**
 * BOLL 状态的 StateStore 键名
 * 格式：indicator:boll:main
 */
export const BOLL_STATE_KEY = createIndicatorStateKey('boll', 'main')

/**
 * 空数据占位状态
 * 消费者应检查 visibleMin > visibleMax 判断"无有效数据"
 */
export const EMPTY_BOLL_STATE: BOLLRenderState = {
  timestamp: 0,
  series: [],
  params: {
    period: DEFAULT_BOLL_PERIOD,
    multiplier: DEFAULT_BOLL_MULTIPLIER,
    showUpper: true,
    showMiddle: true,
    showLower: true,
    showBand: true,
  },
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
